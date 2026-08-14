import type { AllergenKey } from "./keys";

import { fold } from "./fold";

export type MatchMode = "substring" | "word";

export interface Term {
  readonly text: string;
  /**
   * Default `substring`, weil Deutsch Komposita zusammenschreibt: `weizen`
   * muss "Vollkornweizenmehl" finden, `nuss` muss "Nussmischung" finden.
   * `word` für Terme, die in anderen Wörtern aufgehen — `ei` steckt in "Reis"
   * und "Weizen", das englische `nut` in "nutmeg" und "coconut".
   */
  readonly mode?: MatchMode;
}

export interface AllergenSpec {
  readonly key: AllergenKey;
  /** Was in `recipes.contains_allergens` als dieser Key gilt. */
  readonly declaredCodes: readonly string[];
  /** Zutaten-Heuristik, DE und EN gemischt. */
  readonly terms: readonly Term[];
  /** Verwirft einen Termtreffer, der innerhalb eines dieser Begriffe liegt. */
  readonly exclude: readonly string[];
}

/** Kurzschreibweise, damit die Listen unten lesbar bleiben. */
function t(text: string, mode?: MatchMode): Term {
  return mode ? { text, mode } : { text };
}

export const ALLERGEN_SPECS: readonly AllergenSpec[] = [
  {
    key: "gluten",
    declaredCodes: ["gluten", "wheat", "barley", "rye", "spelt", "oats", "cereals"],
    terms: [
      t("gluten"),
      t("weizen"),
      t("dinkel"),
      t("roggen"),
      t("gerste"),
      t("hafer"),
      t("grieß"),
      t("bulgur"),
      t("couscous"),
      t("seitan"),
      t("paniermehl"),
      t("vollkorn"),
      t("nudeln"),
      t("spaghetti"),
      t("pasta"),
      t("brot"),
      t("wheat"),
      t("barley"),
      t("rye"),
      t("spelt"),
      t("oats"),
      t("semolina"),
      t("breadcrumb"),
      t("noodle"),
      t("bread"),
    ],
    // Buchweizen ist der lehrreichste Eintrag: er enthält `weizen` als
    // Substring, ist aber ein glutenfreies Pseudogetreide. Ohne diesen
    // Ausschluss sperrte die App einem Zöliakie-Kind ausgerechnet die Rezepte,
    // die für es gemacht sind.
    exclude: [
      "buchweizen",
      "buckwheat",
      "reisnudeln",
      "glasnudeln",
      "rice noodle",
      "mandelmehl",
      "reismehl",
      "maismehl",
      "kokosmehl",
      "kichererbsenmehl",
      "almond flour",
      "rice flour",
      "corn flour",
    ],
  },
  {
    key: "crustaceans",
    declaredCodes: ["crustaceans", "crustacean", "shellfish"],
    terms: [
      t("garnele"),
      t("krabbe"),
      t("hummer"),
      t("scampi"),
      t("krebs"),
      t("shrimp"),
      t("prawn"),
      t("lobster"),
      t("crab"),
      t("crayfish"),
    ],
    exclude: [],
  },
  {
    key: "eggs",
    declaredCodes: ["eggs", "egg"],
    terms: [
      t("ei", "word"),
      t("eier", "word"),
      t("eigelb"),
      t("eiweiss"),
      t("eiernudeln"),
      t("mayonnaise"),
      t("egg", "word"),
      t("eggs", "word"),
      t("yolk"),
      t("albumen"),
    ],
    exclude: [],
  },
  {
    key: "fish",
    declaredCodes: ["fish"],
    terms: [
      t("fisch"),
      t("lachs"),
      t("thunfisch"),
      t("kabeljau"),
      t("hering"),
      t("sardelle"),
      t("anchovi"),
      t("worcester"),
      t("dashi"),
      t("bonito"),
      t("salmon"),
      t("tuna"),
      t("cod", "word"),
      t("herring"),
      t("anchovy"),
    ],
    exclude: [],
  },
  {
    key: "peanuts",
    declaredCodes: ["peanuts", "peanut"],
    terms: [t("erdnuss"), t("erdnuesse"), t("peanut"), t("groundnut"), t("arachis")],
    exclude: [],
  },
  {
    key: "soy",
    declaredCodes: ["soy", "soya", "soybeans"],
    terms: [
      t("soja"),
      t("tofu"),
      t("edamame"),
      t("miso"),
      t("tempeh"),
      t("soy"),
      t("soya"),
      t("soybean"),
    ],
    exclude: [],
  },
  {
    key: "milk",
    declaredCodes: ["milk", "dairy", "lactose"],
    terms: [
      t("milch"),
      t("butter"),
      t("sahne"),
      t("quark"),
      t("joghurt"),
      t("kaese"),
      t("parmesan"),
      t("pecorino"),
      t("mozzarella"),
      t("mascarpone"),
      t("ricotta"),
      t("schmand"),
      t("molke"),
      t("laktose"),
      t("ghee"),
      t("milk"),
      t("cream"),
      t("cheese"),
      t("yogurt"),
      t("whey"),
      t("lactose"),
    ],
    // Pflanzendrinks enthalten kein Milcheiweiß. "Mandelmilch" verliert damit
    // den milk-Treffer, behält aber den nuts-Treffer über `mandel` — genau so
    // soll das Modell arbeiten.
    exclude: [
      "hafermilch",
      "sojamilch",
      "mandelmilch",
      "reismilch",
      "kokosmilch",
      "oat milk",
      "soy milk",
      "almond milk",
      "rice milk",
      "coconut milk",
    ],
  },
  {
    key: "nuts",
    declaredCodes: ["nuts", "tree_nuts", "treenuts"],
    terms: [
      t("haselnuss"),
      t("walnuss"),
      t("mandel"),
      t("cashew"),
      t("pistazie"),
      t("pekan"),
      t("macadamia"),
      t("paranuss"),
      t("nuss"),
      t("hazelnut"),
      t("walnut"),
      t("almond"),
      t("pistachio"),
      t("pecan"),
      t("brazil nut"),
      t("nut", "word"),
    ],
    // Erdnuss ist eine Hülsenfrucht, Kokos- und Muskatnuss sind keine
    // Schalenfrüchte im Sinne der EU-Kennzeichnung.
    exclude: [
      "erdnuss",
      "peanut",
      "kokosnuss",
      "coconut",
      "muskatnuss",
      "muskat",
      "nutmeg",
      "nutrition",
    ],
  },
  {
    key: "celery",
    declaredCodes: ["celery"],
    terms: [t("sellerie"), t("celery"), t("celeriac")],
    exclude: [],
  },
  {
    key: "mustard",
    declaredCodes: ["mustard"],
    terms: [t("senf"), t("dijon"), t("mustard")],
    exclude: [],
  },
  {
    key: "sesame",
    declaredCodes: ["sesame", "sesame_seeds"],
    terms: [t("sesam"), t("tahin"), t("hummus"), t("sesame"), t("tahini")],
    exclude: [],
  },
  {
    key: "sulphites",
    declaredCodes: ["sulphites", "sulfites", "sulphur_dioxide"],
    terms: [
      t("sulfit"),
      t("schwefeldioxid"),
      t("trockenfruechte"),
      t("wein"),
      t("sulphite"),
      t("sulfite"),
      t("wine", "word"),
    ],
    // "Schweinefleisch" enthält den Term `wein`.
    exclude: ["schwein"],
  },
  {
    key: "lupin",
    declaredCodes: ["lupin"],
    terms: [t("lupine"), t("lupinenmehl"), t("lupin")],
    exclude: [],
  },
  {
    key: "molluscs",
    declaredCodes: ["molluscs", "mollusks"],
    terms: [
      t("muschel"),
      t("tintenfisch"),
      t("calamari"),
      t("auster"),
      t("jakobsmuschel"),
      t("mussel"),
      t("squid"),
      t("octopus"),
      t("oyster"),
      t("clam"),
      t("scallop"),
    ],
    exclude: [],
  },
];

export interface FoldedTerm {
  readonly text: string;
  readonly mode: MatchMode;
}

export interface FoldedSpec {
  readonly key: AllergenKey;
  readonly terms: readonly FoldedTerm[];
  readonly exclude: readonly string[];
}

/**
 * Die Listen werden lesbar gepflegt ("Haselnuss") und hier einmalig durch
 * dieselbe `fold()`-Funktion gezogen, die auch die Zutaten trifft. Eine
 * Definition der Normalisierung, nicht zwei.
 */
export const FOLDED_SPECS: readonly FoldedSpec[] = ALLERGEN_SPECS.map((spec) => ({
  key: spec.key,
  terms: spec.terms.map((term) => ({ text: fold(term.text), mode: term.mode ?? "substring" })),
  exclude: spec.exclude.map(fold),
}));

const DECLARED_INDEX = new Map<string, AllergenKey>(
  ALLERGEN_SPECS.flatMap((spec) =>
    spec.declaredCodes.map((code): [string, AllergenKey] => [fold(code), spec.key]),
  ),
);

/**
 * Ein Code aus `recipes.contains_allergens` → Key, oder `null`. Groß- und
 * Kleinschreibung sowie Trennzeichen sind egal; `null` heißt "kennen wir
 * nicht" und wird vom Urteil bewusst nicht als Entwarnung gewertet.
 */
export function keyForDeclaredCode(code: string): AllergenKey | null {
  return DECLARED_INDEX.get(fold(code)) ?? null;
}
