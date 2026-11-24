-- Eltern Flow AI: Der Forward-Split übernimmt die Erinnerungen der Serie
-- Spec: docs/superpowers/specs/2026-11-19-kalender-stille-fehler-design.md (§3 A)
--
-- „Diesen und alle folgenden" spaltet über `insert_split_event` eine neue Serie mit neuer Id
-- ab. Erinnerungen hängen an `event_id`, die neue Hälfte stand deshalb ohne eine einzige da.
-- Jetzt kopiert der Zweig jede Erinnerung der Serie auf die neue Id: `offset_minutes` und
-- `recipient_parent_id`. `sent_at` bleibt leer, `family_id` setzt der Trigger
-- `reminders_set_family_id`.
--
-- Kopiert, nicht verschoben: Die alte Serie behält ihre Erinnerungen, denn sie trägt weiter
-- alle Occurrences vor dem Split, und für die gilt, was vorher galt. Danach erinnern beide
-- Hälften wie die Serie vor dem Split.
--
-- Postgres kennt kein teilweises Ersetzen, deshalb steht der ganze Rumpf hier noch einmal,
-- wörtlich aus 20261026163759_calendar_transaction_rpc.sql. Geändert sind nur `v_new_id` im
-- declare-Block, `returning id into v_new_id` am Insert des Splits und die Kopie danach.
-- Signatur, security invoker und search_path bleiben; `create or replace` erhält Kommentar
-- und Rechte.
--
-- RLS auf `reminders` gilt (security invoker). Lese- und Insert-Policy sind familienweit, nicht
-- auf den Empfänger beschränkt; die Kopie sieht und schreibt also jede Erinnerung der Serie.
-- Ein wiederholter Aufruf mit derselben Kennung endet als 'already_applied', bevor ein Schritt
-- läuft, doppelte Kopien entstehen also nicht.

create or replace function public.apply_event_change(
  p_request_id                uuid,
  p_event_id                  uuid,
  p_occurrence_key            date,
  p_seen_master_updated_at    timestamptz,
  p_seen_exception_updated_at timestamptz,
  p_steps                     jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid                   uuid := (select auth.uid());
  v_booked                integer;
  v_booked_event_id       uuid;
  v_master                public.events%rowtype;
  v_exception_id          uuid;
  v_exception_updated_at  timestamptz;
  v_step                  jsonb;
  v_index                 bigint;
  v_op                    text;
  v_allowed               text[];
  v_required              text[];
  v_key                   text;
  v_fields                jsonb;
  v_recurrence            jsonb;
  v_byweekday             integer[];
  v_after_delete_master   boolean := false;
  v_new_id                uuid;
begin
  -- 1. Nur für angemeldete Nutzer (§5.2 Schritt 1). `anon` erreicht diese Zeile gar
  --    nicht (kein execute); das hier fängt eine Sitzung ohne `sub` ab.
  if v_uid is null then
    raise exception 'apply_event_change: nicht angemeldet' using errcode = '42501';
  end if;

  -- Beide gehen in die Verbuchung, deren Spalten NOT NULL sind. Ohne die Prüfung endete
  -- ein null dort als 23502, dessen Meldung die interne Tabelle nennt.
  if p_request_id is null then
    raise exception 'apply_event_change: p_request_id fehlt' using errcode = '22023';
  end if;

  if p_event_id is null then
    raise exception 'apply_event_change: p_event_id fehlt' using errcode = '22023';
  end if;

  -- 2. Verbuchen.
  insert into private.event_change_requests (user_id, request_id, event_id)
  values (v_uid, p_request_id, p_event_id)
  on conflict (user_id, request_id) do nothing;
  get diagnostics v_booked = row_count;

  -- 3. Aufräumen.
  delete from private.event_change_requests r
  where r.user_id = v_uid
    and r.created_at < now() - interval '30 days'
    and r.request_id <> p_request_id;

  if v_booked = 0 then
    -- Schon verbucht. Nur derselbe Termin gilt als Wiederholung. Fehlt die Zeile hier
    -- (ein gleichzeitiger Aufruf desselben Nutzers hat sie nach 30 Tagen weggeräumt),
    -- gilt die Grenze aus §6, und der Aufruf bleibt ein 'already_applied'.
    select r.event_id into v_booked_event_id
    from private.event_change_requests r
    where r.user_id = v_uid
      and r.request_id = p_request_id;
    if found and v_booked_event_id is distinct from p_event_id then
      raise exception 'apply_event_change: Kennung ist schon für einen anderen Termin verbucht'
        using errcode = '22023';
    end if;
    return 'already_applied';
  end if;

  -- 4. Eingaben prüfen (§5.3). Ausschließlich gegen die Parameter, ohne Tabellenzugriff.
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'apply_event_change: p_steps muss ein JSON-Array sein' using errcode = '22023';
  end if;

  if jsonb_array_length(p_steps) not between 1 and 4 then
    raise exception 'apply_event_change: p_steps braucht 1 bis 4 Schritte' using errcode = '22023';
  end if;

  if p_seen_master_updated_at is null then
    raise exception 'apply_event_change: p_seen_master_updated_at fehlt' using errcode = '22023';
  end if;

  -- Ohne Schlüssel gibt es keine Exception, deren Stand man gesehen haben könnte.
  if p_occurrence_key is null and p_seen_exception_updated_at is not null then
    raise exception 'apply_event_change: gesehene Exception ohne p_occurrence_key' using errcode = '22023';
  end if;

  for v_step, v_index in
    select s.step, s.idx
    from jsonb_array_elements(p_steps) with ordinality as s(step, idx)
    order by s.idx
  loop
    if jsonb_typeof(v_step) <> 'object' then
      raise exception 'apply_event_change: Schritt % ist kein JSON-Objekt', v_index using errcode = '22023';
    end if;

    -- Nach dem Löschen des Masters gibt es nichts mehr, worauf ein Schritt wirken könnte.
    -- Ein update fände null Zeilen und meldete keinen Fehler; deshalb ist delete_master
    -- nur als letzter Schritt erlaubt. Kein Pfad im Client schickt etwas anderes.
    if v_after_delete_master then
      raise exception 'apply_event_change: Schritt % folgt auf delete_master', v_index using errcode = '22023';
    end if;

    -- Erlaubte und Pflichtschlüssel je op. Keine op trägt `event_id`, `occurrence_key`
    -- oder `from`: Alle wirken auf `p_event_id` bzw. `p_occurrence_key`, damit ein
    -- Aufruf weder einen zweiten Termin noch eine ungeprüfte Exception erreicht (§5.3).
    v_op := case when jsonb_typeof(v_step -> 'op') = 'string' then v_step ->> 'op' end;
    case v_op
      when 'update_master' then
        v_allowed := array['op', 'changes', 'recurrence'];
        v_required := array['changes'];
      when 'modify_occurrence' then
        v_allowed := array['op', 'override'];
        v_required := array['override'];
      when 'cancel_occurrence', 'delete_master', 'delete_all_exceptions', 'delete_exceptions_from' then
        v_allowed := array['op'];
        v_required := array[]::text[];
      when 'set_rrule_until' then
        v_allowed := array['op', 'until'];
        v_required := array['until'];
      when 'set_rrule_count' then
        v_allowed := array['op', 'count'];
        v_required := array['count'];
      when 'insert_split_event' then
        v_allowed := array['op', 'changes', 'rrule_count'];
        v_required := array['changes', 'rrule_count'];
      else
        raise exception 'apply_event_change: Schritt % hat keine erlaubte op', v_index using errcode = '22023';
    end case;

    select k.key into v_key
    from jsonb_object_keys(v_step) as k(key)
    where k.key <> all (v_allowed)
    limit 1;
    if v_key is not null then
      raise exception 'apply_event_change: Schritt % (%) kennt den Schlüssel "%" nicht', v_index, v_op, v_key
        using errcode = '22023';
    end if;

    if not (v_step ?& v_required) then
      raise exception 'apply_event_change: Schritt % (%) fehlt ein Pflichtschlüssel', v_index, v_op
        using errcode = '22023';
    end if;

    if v_op in ('modify_occurrence', 'cancel_occurrence', 'delete_exceptions_from')
       and p_occurrence_key is null then
      raise exception 'apply_event_change: Schritt % (%) braucht p_occurrence_key', v_index, v_op
        using errcode = '22023';
    end if;

    -- `changes` und `override`: dieselben fünf Felder, Werte Text oder null. Jedes Feld
    -- ist optional. Fehlt eines in `changes`, behält `update_master` den Wert der Spalte,
    -- und `insert_split_event` nimmt ihn vom gesperrten Master (siehe Schritt 7).
    v_fields := case v_op
      when 'modify_occurrence' then v_step -> 'override'
      when 'update_master' then v_step -> 'changes'
      when 'insert_split_event' then v_step -> 'changes'
    end;
    if v_fields is not null then
      if jsonb_typeof(v_fields) <> 'object' then
        raise exception 'apply_event_change: Schritt % (%) braucht ein JSON-Objekt als Feldsatz', v_index, v_op
          using errcode = '22023';
      end if;

      select f.key into v_key
      from jsonb_object_keys(v_fields) as f(key)
      where f.key <> all (array['title', 'start_at', 'end_at', 'location', 'description'])
      limit 1;
      if v_key is not null then
        raise exception 'apply_event_change: Schritt % (%) kennt das Feld "%" nicht', v_index, v_op, v_key
          using errcode = '22023';
      end if;

      select f.key into v_key
      from jsonb_each(v_fields) as f(key, value)
      where jsonb_typeof(f.value) not in ('string', 'null')
      limit 1;
      if v_key is not null then
        raise exception 'apply_event_change: Schritt % (%): Feld "%" muss Text oder null sein', v_index, v_op, v_key
          using errcode = '22023';
      end if;

      -- `changes` landet in Spalten von `events`, und dort sind `title`, `start_at` und
      -- `end_at` NOT NULL. Ein explizites null endete sonst erst im Schritt als 23502,
      -- nach der Sperre. `override` betrifft das nicht: Es wird als JSON gespeichert.
      if v_op in ('update_master', 'insert_split_event') then
        select f.key into v_key
        from jsonb_each(v_fields) as f(key, value)
        where f.key in ('title', 'start_at', 'end_at')
          and jsonb_typeof(f.value) = 'null'
        limit 1;
        if v_key is not null then
          raise exception 'apply_event_change: Schritt % (%): Feld "%" darf nicht null sein', v_index, v_op, v_key
            using errcode = '22023';
        end if;
      end if;
    end if;

    -- `recurrence`: die fünf rrule-Spalten. JSON-null zählt wie „nicht mitgeschickt".
    v_recurrence := case when v_op = 'update_master' then nullif(v_step -> 'recurrence', 'null'::jsonb) end;
    if v_recurrence is not null then
      if jsonb_typeof(v_recurrence) <> 'object' then
        raise exception 'apply_event_change: Schritt % (%): recurrence muss ein JSON-Objekt sein', v_index, v_op
          using errcode = '22023';
      end if;

      select r.key into v_key
      from jsonb_each(v_recurrence) as r(key, value)
      where r.key <> all (array['rrule_freq', 'rrule_interval', 'rrule_byweekday', 'rrule_count', 'rrule_until'])
         or (jsonb_typeof(r.value) <> 'null'
             and jsonb_typeof(r.value) <> case r.key
                                            when 'rrule_freq' then 'string'
                                            when 'rrule_until' then 'string'
                                            when 'rrule_byweekday' then 'array'
                                            else 'number'
                                          end)
      limit 1;
      if v_key is not null then
        raise exception 'apply_event_change: Schritt % (%): recurrence-Feld "%" unbekannt oder falsch typisiert',
          v_index, v_op, v_key
          using errcode = '22023';
      end if;

      if jsonb_typeof(v_recurrence -> 'rrule_byweekday') = 'array'
         and exists (
           select 1
           from jsonb_array_elements(v_recurrence -> 'rrule_byweekday') as w(day)
           where jsonb_typeof(w.day) <> 'number'
         ) then
        raise exception 'apply_event_change: Schritt % (%): rrule_byweekday braucht Zahlen', v_index, v_op
          using errcode = '22023';
      end if;
    end if;

    if v_op = 'set_rrule_until' and jsonb_typeof(v_step -> 'until') <> 'string' then
      raise exception 'apply_event_change: Schritt % (%): until muss ein Zeitpunkt als Text sein', v_index, v_op
        using errcode = '22023';
    end if;

    if v_op = 'set_rrule_count' and jsonb_typeof(v_step -> 'count') <> 'number' then
      raise exception 'apply_event_change: Schritt % (%): count muss eine Zahl sein', v_index, v_op
        using errcode = '22023';
    end if;

    if v_op = 'insert_split_event' and jsonb_typeof(v_step -> 'rrule_count') not in ('number', 'null') then
      raise exception 'apply_event_change: Schritt % (%): rrule_count muss eine Zahl oder null sein', v_index, v_op
        using errcode = '22023';
    end if;

    -- Alle Typumwandlungen der Schritte einmal probehalber: Ein unbrauchbarer Wert
    -- („gestern", 2.5 als Anzahl, ein unbekannter Rhythmus) endet so als 22023, bevor
    -- irgendetwas gesperrt ist, statt als 22007/22P02 mitten in den Schritten.
    begin
      perform
        (v_fields ->> 'start_at')::timestamptz,
        (v_fields ->> 'end_at')::timestamptz,
        (v_recurrence ->> 'rrule_freq')::public.rrule_freq_enum,
        (v_recurrence ->> 'rrule_interval')::integer,
        (v_recurrence ->> 'rrule_count')::integer,
        (v_recurrence ->> 'rrule_until')::timestamptz,
        (select array_agg(w.day::integer)
         from jsonb_array_elements_text(
           case when jsonb_typeof(v_recurrence -> 'rrule_byweekday') = 'array'
             then v_recurrence -> 'rrule_byweekday'
           end
         ) as w(day)),
        (v_step ->> 'until')::timestamptz,
        (v_step ->> 'count')::integer,
        (v_step ->> 'rrule_count')::integer;
    exception when data_exception then
      raise exception 'apply_event_change: Schritt % (%) enthält einen unbrauchbaren Wert', v_index, v_op
        using errcode = '22023';
    end;

    v_after_delete_master := v_op = 'delete_master';
  end loop;

  -- 5. Sperren, Master vor Exception (§5.2 Schritte 3–4). RLS gilt: Ein Termin einer
  --    fremden Familie ist für diese Abfrage nicht da, und die Meldung unterscheidet
  --    „gibt es nicht" nicht von „darfst du nicht sehen".
  --
  --    Bewusst `for update`, nicht `for no key update`, aus zwei Gründen:
  --    - Es blockiert die Fremdschlüsselprüfung (`for key share`), die jeder neue
  --      Exception-Insert auf diesen Termin braucht. Ein Schreiber ohne RPC kann so
  --      während des Aufrufs keine Exception unterschieben.
  --    - `delete_master` braucht diese Sperrstufe ohnehin. Sie gleich zu nehmen erspart
  --      eine Hochstufung mitten im Aufruf, die mit wartenden `key share`-Sperren in
  --      einen Deadlock laufen könnte.
  select e.* into v_master
  from public.events e
  where e.id = p_event_id
  for update of e;
  if not found then
    raise exception 'apply_event_change: Termin nicht gefunden' using errcode = 'EF404';
  end if;

  if p_occurrence_key is not null then
    select x.id, x.updated_at into v_exception_id, v_exception_updated_at
    from public.event_exceptions x
    where x.event_id = p_event_id
      and x.occurrence_date = p_occurrence_key
    for update of x;
  end if;

  -- 6. Gesehenen Stand vergleichen (§5.2 Schritt 5). Eine Exception, die neu da ist,
  --    verschwunden ist oder sich geändert hat, weicht gleichermaßen ab.
  if v_master.updated_at is distinct from p_seen_master_updated_at then
    raise exception 'apply_event_change: Konflikt' using errcode = 'EF409', detail = 'master';
  end if;

  if v_exception_updated_at is distinct from p_seen_exception_updated_at then
    raise exception 'apply_event_change: Konflikt' using errcode = 'EF409', detail = 'exception';
  end if;

  -- 7. Schritte (§5.3), jeder mit der Wirkung seines PostgREST-Aufrufs aus der Zeit vor
  --    Block 7, als der Client die Schritte einzeln schrieb — mit einem Unterschied: Ein
  --    Schreibzugriff auf den Master, der null Zeilen trifft, ist hier ein Fehler, kein
  --    stiller Erfolg.
  --
  --    Die Sperre hält die Zeile fest, nicht die Berechtigung. Unter READ COMMITTED
  --    wertet RLS `current_family_id()` in jedem Statement neu aus; verliert der
  --    Aufrufer zwischen zwei Schritten seine Familie (die Policy „parents: delete
  --    self", ein zweites Gerät), sieht der nächste Schritt den Master nicht mehr. Ohne
  --    die Prüfung wäre das 'applied' mit halb ausgeführten Schritten und stehender
  --    Verbuchung — genau Lücke 2. Mit ihr rollt EF404 alles zurück. Die
  --    Einfüge-Schritte (Exception-Upsert, Split) brauchen keine eigene Prüfung: Einen
  --    Insert ohne Familie lehnt RLS mit 42501 ab, statt ihn still zu verwerfen.
  for v_step, v_index in
    select s.step, s.idx
    from jsonb_array_elements(p_steps) with ordinality as s(step, idx)
    order by s.idx
  loop
    v_op := v_step ->> 'op';
    case v_op
      when 'update_master' then
        -- Nur die mitgeschickten Schlüssel, wie PostgREST `.update(changes)`; ein
        -- explizites null schreibt null (bei den Pflichtfeldern hat Schritt 4 es abgelehnt).
        v_fields := v_step -> 'changes';
        v_recurrence := coalesce(nullif(v_step -> 'recurrence', 'null'::jsonb), '{}'::jsonb);
        v_byweekday := null;
        if jsonb_typeof(v_recurrence -> 'rrule_byweekday') = 'array' then
          v_byweekday := array(
            select w.day::integer
            from jsonb_array_elements_text(v_recurrence -> 'rrule_byweekday') with ordinality as w(day, idx)
            order by w.idx
          );
        end if;

        update public.events e set
          title           = case when v_fields ? 'title' then v_fields ->> 'title' else e.title end,
          description     = case when v_fields ? 'description' then v_fields ->> 'description' else e.description end,
          location        = case when v_fields ? 'location' then v_fields ->> 'location' else e.location end,
          start_at        = case when v_fields ? 'start_at'
                              then (v_fields ->> 'start_at')::timestamptz else e.start_at end,
          end_at          = case when v_fields ? 'end_at'
                              then (v_fields ->> 'end_at')::timestamptz else e.end_at end,
          rrule_freq      = case when v_recurrence ? 'rrule_freq'
                              then (v_recurrence ->> 'rrule_freq')::public.rrule_freq_enum else e.rrule_freq end,
          rrule_interval  = case when v_recurrence ? 'rrule_interval'
                              then (v_recurrence ->> 'rrule_interval')::integer else e.rrule_interval end,
          rrule_byweekday = case when v_recurrence ? 'rrule_byweekday' then v_byweekday else e.rrule_byweekday end,
          rrule_count     = case when v_recurrence ? 'rrule_count'
                              then (v_recurrence ->> 'rrule_count')::integer else e.rrule_count end,
          rrule_until     = case when v_recurrence ? 'rrule_until'
                              then (v_recurrence ->> 'rrule_until')::timestamptz else e.rrule_until end
        where e.id = p_event_id;
        if not found then
          raise exception 'apply_event_change: Schritt % (%) trifft den Termin nicht mehr', v_index, v_op
            using errcode = 'EF404';
        end if;

      when 'modify_occurrence', 'cancel_occurrence' then
        -- Upsert wie PostgREST `upsert(…, { onConflict: "event_id,occurrence_date" })`,
        -- mit einer Bedingung: Überschrieben wird nur die Zeile, die Schritt 5 gesperrt
        -- hat (bzw. die dieser Aufruf selbst geschrieben hat). Jede andere Zeile an
        -- diesem Schlüssel ist ein Konflikt statt stillem Überschreiben.
        --
        -- Wie kommt eine solche Zeile zustande? Ein frischer INSERT aus einer anderen
        -- Sitzung schafft es nicht: Seine Fremdschlüsselprüfung braucht `for key share`
        -- auf den Master, und die `for update`-Sperre aus Schritt 5 hält ihn auf. Er
        -- wartet bis zum Commit, oder er steht mit seinem Indexeintrag schon an diesem
        -- Schlüssel, dann warten beide aufeinander und Postgres bricht einen der beiden
        -- mit 40P01 ab. Halb geschrieben bleibt in keinem Fall etwas. Die Bedingung
        -- greift dort, wo keine Fremdschlüsselprüfung anfällt:
        -- - eine bestehende Exception dieses Termins, die ein anderer Schreiber per
        --   UPDATE von `occurrence_date` auf diesen Schlüssel schiebt;
        -- - Zeilen aus derselben Transaktion (Trigger, frühere Schritte).
        insert into public.event_exceptions as x (event_id, occurrence_date, action, override)
        values (
          p_event_id,
          p_occurrence_key,
          case v_op
            when 'modify_occurrence' then 'modified'::public.event_exception_action_enum
            else 'cancelled'::public.event_exception_action_enum
          end,
          -- Verbatim, nur Schlüssel aus der Whitelist: `"location": null` bleibt als
          -- Schlüssel stehen, wie es `modifyOccurrence` heute schreibt.
          case when v_op = 'modify_occurrence' then v_step -> 'override' end
        )
        on conflict (event_id, occurrence_date) do update
          set action = excluded.action,
              override = excluded.override
          where x.id = v_exception_id
        returning x.id into v_exception_id;
        if not found then
          raise exception 'apply_event_change: Konflikt' using errcode = 'EF409', detail = 'exception';
        end if;

      when 'delete_master' then
        -- Die Exceptions gehen per `on delete cascade` mit.
        delete from public.events e where e.id = p_event_id;
        if not found then
          raise exception 'apply_event_change: Schritt % (%) trifft den Termin nicht mehr', v_index, v_op
            using errcode = 'EF404';
        end if;

      when 'delete_all_exceptions' then
        delete from public.event_exceptions x where x.event_id = p_event_id;
        v_exception_id := null;

      when 'delete_exceptions_from' then
        delete from public.event_exceptions x
        where x.event_id = p_event_id
          and x.occurrence_date >= p_occurrence_key;
        v_exception_id := null;

      when 'set_rrule_until' then
        update public.events e set rrule_until = (v_step ->> 'until')::timestamptz where e.id = p_event_id;
        if not found then
          raise exception 'apply_event_change: Schritt % (%) trifft den Termin nicht mehr', v_index, v_op
            using errcode = 'EF404';
        end if;

      when 'set_rrule_count' then
        update public.events e set rrule_count = (v_step ->> 'count')::integer where e.id = p_event_id;
        if not found then
          raise exception 'apply_event_change: Schritt % (%) trifft den Termin nicht mehr', v_index, v_op
            using errcode = 'EF404';
        end if;

      when 'insert_split_event' then
        -- Alles außer `changes` und `rrule_count` kommt aus dem in Schritt 5 gelesenen
        -- Master, nicht vom Client und nicht aus dem Stand nach früheren Schritten.
        -- UNTIL gilt nur ohne COUNT (`events_rrule_count_xor_until`).
        --
        -- Die fünf Felder aus `changes` gelten je Schlüssel, wie bei `update_master`:
        -- Ein mitgeschicktes null schreibt null (nur `location` und `description`, die
        -- Prüfung in Schritt 4 lässt es für die Pflichtfelder nicht durch), ein fehlender
        -- Schlüssel nimmt den Wert des gesperrten Masters. Der Client schickt heute immer
        -- alle fünf.
        v_fields := v_step -> 'changes';
        insert into public.events (
          family_id, type_id, child_id, parent_id,
          title, description, location, start_at, end_at,
          all_day, timezone,
          rrule_freq, rrule_interval, rrule_byweekday, rrule_until, rrule_count,
          created_by
        ) values (
          v_master.family_id, v_master.type_id, v_master.child_id, v_master.parent_id,
          case when v_fields ? 'title' then v_fields ->> 'title' else v_master.title end,
          case when v_fields ? 'description' then v_fields ->> 'description' else v_master.description end,
          case when v_fields ? 'location' then v_fields ->> 'location' else v_master.location end,
          case when v_fields ? 'start_at' then (v_fields ->> 'start_at')::timestamptz else v_master.start_at end,
          case when v_fields ? 'end_at' then (v_fields ->> 'end_at')::timestamptz else v_master.end_at end,
          v_master.all_day, v_master.timezone,
          v_master.rrule_freq, v_master.rrule_interval, v_master.rrule_byweekday,
          case when v_step ->> 'rrule_count' is null then v_master.rrule_until end,
          (v_step ->> 'rrule_count')::integer,
          v_master.created_by
        )
        returning id into v_new_id;

        insert into public.reminders (event_id, offset_minutes, recipient_parent_id)
        select v_new_id, r.offset_minutes, r.recipient_parent_id
        from public.reminders r
        where r.event_id = p_event_id;
    end case;
  end loop;

  -- Löschschritte an den Exceptions dürfen legitim null Zeilen treffen und taugen
  -- deshalb nicht als Trefferprüfung. Ob der Aufrufer nach dem letzten Schritt noch
  -- zur Familie des Termins gehört, deckt sie ab: Wer sie verloren hat, hat seine
  -- letzten Schritte ins Leere geschrieben.
  if public.current_family_id() is distinct from v_master.family_id then
    raise exception 'apply_event_change: nicht mehr in der Familie des Termins' using errcode = 'EF404';
  end if;

  return 'applied';
end;
$$;
