-- Eltern Flow AI: Backfill children.allergies from localized labels to stable
-- keys.
--
-- Before the allergy-key fix, Step4FirstChild persisted t()-translated labels
-- (e.g. "Erdnüsse", "Milk") into children.allergies[]. The app now stores and
-- renders stable keys (peanuts/milk/eggs/gluten/soy/nuts). This one-time
-- backfill converts any pre-existing localized values (DE + EN) to keys so old
-- rows render correctly after the switch. Idempotent — keys map to themselves;
-- unknown values are left untouched. No-op on a fresh database.

update public.children c
set allergies = sub.mapped
from (
  select ch.id,
         array_agg(
           case lower(u.elem)
             when 'erdnüsse' then 'peanuts'
             when 'peanuts'  then 'peanuts'
             when 'milch'    then 'milk'
             when 'milk'     then 'milk'
             when 'eier'     then 'eggs'
             when 'eggs'     then 'eggs'
             when 'gluten'   then 'gluten'
             when 'soja'     then 'soy'
             when 'soy'      then 'soy'
             when 'nüsse'    then 'nuts'
             when 'nuts'     then 'nuts'
             else u.elem
           end
           order by u.ord
         ) as mapped
  from public.children ch
  cross join lateral unnest(ch.allergies) with ordinality as u(elem, ord)
  where ch.allergies is not null and array_length(ch.allergies, 1) > 0
  group by ch.id
) sub
where c.id = sub.id and c.allergies is distinct from sub.mapped;
