-- Eltern Flow AI: Seed-Rezepte für den globalen Pool.
--
-- Der Pool war bis hierher leer (kein einziges `insert into public.recipes`),
-- der gustar.io-Worker existiert nicht. Ohne Rezepte lässt sich der
-- Allergen-Filter (ADR-014) weder am Gerät prüfen noch überhaupt sehen.
--
-- Die Auswahl deckt alle vier Urteilszustände aus ADR-014 ab:
--   - deklariert mit Allergen           → unsafe
--   - deklariert ohne passendes Allergen → safe
--   - leer deklariert, Zutaten sprechen  → caution
--   - leer deklariert, Zutaten unauffällig → unverified
--
-- SENTINEL 'none': Das Urteilsmodell liest ein leeres `contains_allergens` als
-- "nie klassifiziert" (→ unverified), nicht als "allergenfrei". Damit hat ein
-- Rezept, das ein Klassifizierer geprüft und für sauber befunden hat, keine
-- Ausdrucksform — der Zustand `safe` wäre in der Praxis unerreichbar. Bis das
-- Schema das sauber trennt (eigene Spalte `allergens_classified_at`, siehe
-- docs/TODO.md), markiert der Code 'none' ein geprüftes Rezept ohne Fund.
--
-- Der Code ist im Klassifizierer als `NO_ALLERGENS_CODE` geführt
-- (features/meals/allergens/terms.ts) und damit ein BEKANNTER Code: er benennt
-- kein Allergen und trifft nie, gilt aber als verstanden. Das ist der
-- Unterschied, der zählt — ein *unbekannter* Code verhindert `safe`, weil er
-- in einem fremden Vokabular genau das gesuchte Allergen benennen könnte.
--
-- `recipe_dedup_hash` ist `not null unique`. Statt einen echten sha256 zu
-- berechnen, tragen die Seeds ein stabiles 'seed-<slug>' — ehrlicher als ein
-- Pseudo-Hash und kollisionsfrei gegenüber echten Importen, deren Hash aus
-- Titel und Zutaten entsteht.

insert into public.recipes (
  source, source_url, created_by_family_id,
  title, description, image_url, duration_min, servings, difficulty,
  ingredients, instructions, contains_allergens, diet_tags, keywords,
  recipe_dedup_hash
)
values
  -- unsafe: deklariert Ei, Milch, Weizen
  (
    'user_custom', null, null,
    '{"de":"Spaghetti Carbonara","en":"Spaghetti Carbonara"}'::jsonb,
    '{"de":"Der Klassiker — ohne Sahne, dafür mit Eigelb.","en":"The classic — no cream, just egg yolk."}'::jsonb,
    null, 25, 4, 'easy',
    '[{"amount":"400","unit":"g","name":{"de":"Spaghetti","en":"spaghetti"}},
      {"amount":"4","unit":null,"name":{"de":"Eigelb","en":"egg yolks"}},
      {"amount":"80","unit":"g","name":{"de":"Pecorino","en":"pecorino"}},
      {"amount":"120","unit":"g","name":{"de":"Guanciale","en":"guanciale"}}]'::jsonb,
    '[{"de":"Nudeln in Salzwasser kochen.","en":"Cook the pasta in salted water."},
      {"de":"Guanciale auslassen.","en":"Render the guanciale."},
      {"de":"Eigelb mit Pecorino verrühren und unterheben.","en":"Whisk yolks with pecorino and fold in."}]'::jsonb,
    array['egg','milk','wheat'], array[]::text[], array['pasta','italienisch'],
    'seed-carbonara'
  ),
  -- unsafe: deklariert Erdnuss, Fisch, Ei, Soja
  (
    'user_custom', null, null,
    '{"de":"Pad Thai","en":"Pad Thai"}'::jsonb,
    '{"de":"Reisnudeln aus dem Wok, in 20 Minuten fertig.","en":"Wok-fried rice noodles, done in 20 minutes."}'::jsonb,
    null, 20, 2, 'medium',
    '[{"amount":"200","unit":"g","name":{"de":"Reisnudeln","en":"rice noodles"}},
      {"amount":"50","unit":"g","name":{"de":"Erdnüsse","en":"peanuts"}},
      {"amount":"2","unit":"EL","name":{"de":"Fischsauce","en":"fish sauce"}},
      {"amount":"2","unit":null,"name":{"de":"Eier","en":"eggs"}},
      {"amount":"150","unit":"g","name":{"de":"Tofu","en":"tofu"}}]'::jsonb,
    '[{"de":"Nudeln einweichen.","en":"Soak the noodles."},
      {"de":"Alles im Wok braten.","en":"Stir-fry everything in the wok."}]'::jsonb,
    array['peanut','fish','egg','soy'], array[]::text[], array['asiatisch','wok'],
    'seed-pad-thai'
  ),
  -- safe: geprüft, kein Allergen gefunden
  (
    'user_custom', null, null,
    '{"de":"Ofengemüse mit Kräutern","en":"Roasted vegetables with herbs"}'::jsonb,
    '{"de":"Blech rein, warten, fertig.","en":"Tray in, wait, done."}'::jsonb,
    null, 40, 4, 'easy',
    '[{"amount":"500","unit":"g","name":{"de":"Kartoffeln","en":"potatoes"}},
      {"amount":"2","unit":null,"name":{"de":"Karotten","en":"carrots"}},
      {"amount":"1","unit":null,"name":{"de":"Zucchini","en":"zucchini"}},
      {"amount":"3","unit":"EL","name":{"de":"Olivenöl","en":"olive oil"}}]'::jsonb,
    '[{"de":"Gemüse würfeln.","en":"Dice the vegetables."},
      {"de":"Bei 200 °C 35 Minuten backen.","en":"Bake at 200 °C for 35 minutes."}]'::jsonb,
    array['none'], array['vegan'], array['gemuese','ofen'],
    'seed-ofengemuese'
  ),
  -- safe für die meisten, unsafe nur bei Gluten-Allergie
  (
    'user_custom', null, null,
    '{"de":"Tomaten-Bruschetta","en":"Tomato bruschetta"}'::jsonb,
    '{"de":"Fünf Zutaten, zehn Minuten.","en":"Five ingredients, ten minutes."}'::jsonb,
    null, 10, 2, 'easy',
    '[{"amount":"4","unit":"Scheiben","name":{"de":"Weißbrot","en":"white bread"}},
      {"amount":"3","unit":null,"name":{"de":"Tomaten","en":"tomatoes"}},
      {"amount":"1","unit":null,"name":{"de":"Knoblauchzehe","en":"garlic clove"}},
      {"amount":"2","unit":"EL","name":{"de":"Olivenöl","en":"olive oil"}}]'::jsonb,
    '[{"de":"Brot rösten.","en":"Toast the bread."},
      {"de":"Tomaten würfeln und aufhäufen.","en":"Dice the tomatoes and pile them on."}]'::jsonb,
    array['wheat'], array['vegan'], array['vorspeise','schnell'],
    'seed-bruschetta'
  ),
  -- caution: KEINE Deklaration, aber die Zutaten sprechen (Sesam via Tahin)
  (
    'user_custom', null, null,
    '{"de":"Hummus","en":"Hummus"}'::jsonb,
    '{"de":"Cremig, zitronig, in fünf Minuten im Mixer.","en":"Creamy, lemony, five minutes in the blender."}'::jsonb,
    null, 10, 4, 'easy',
    '[{"amount":"400","unit":"g","name":{"de":"Kichererbsen","en":"chickpeas"}},
      {"amount":"3","unit":"EL","name":{"de":"Tahin","en":"tahini"}},
      {"amount":"1","unit":null,"name":{"de":"Zitrone","en":"lemon"}},
      {"amount":"1","unit":null,"name":{"de":"Knoblauchzehe","en":"garlic clove"}}]'::jsonb,
    '[{"de":"Alles im Mixer glatt rühren.","en":"Blend everything until smooth."}]'::jsonb,
    array[]::text[], array['vegan'], array['dip','orientalisch'],
    'seed-hummus'
  ),
  -- unverified: keine Deklaration, Zutaten unauffällig
  (
    'user_custom', null, null,
    '{"de":"Karottensuppe","en":"Carrot soup"}'::jsonb,
    '{"de":"Ein Topf, wenig Aufwand.","en":"One pot, little effort."}'::jsonb,
    null, 30, 4, 'easy',
    '[{"amount":"600","unit":"g","name":{"de":"Karotten","en":"carrots"}},
      {"amount":"1","unit":null,"name":{"de":"Zwiebel","en":"onion"}},
      {"amount":"800","unit":"ml","name":{"de":"Gemüsebrühe","en":"vegetable stock"}},
      {"amount":"1","unit":"TL","name":{"de":"Ingwer","en":"ginger"}}]'::jsonb,
    '[{"de":"Alles weich kochen.","en":"Simmer until soft."},
      {"de":"Fein pürieren.","en":"Blend until smooth."}]'::jsonb,
    array[]::text[], array['vegan'], array['suppe','einfach'],
    'seed-karottensuppe'
  )
on conflict (recipe_dedup_hash) do nothing;
