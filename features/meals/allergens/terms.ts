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
  /**
   * Selbstbezeichnung: der Begriff benennt das Allergen selbst ("gluten",
   * "milch", "nuss"), nicht eine Sorte oder einen Begleitstoff ("nudeln",
   * "butter", "mandel"). Nur ein verneinter Selbstbegriff ("glutenfreie
   * Nudeln") räumt den Key im Teilstück ab. `laktose` ist das Gegenbeispiel:
   * "laktosefrei" heißt gespaltener Milchzucker, das Milcheiweiß bleibt. Regel
   * und Grenzen: ADR-061.
   */
  readonly self?: boolean;
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

/** Wie `t()`, markiert den Begriff aber als Selbstbezeichnung des Allergens. */
function ts(text: string, mode?: MatchMode): Term {
  return { ...t(text, mode), self: true };
}

export const ALLERGEN_SPECS: readonly AllergenSpec[] = [
  {
    key: "gluten",
    declaredCodes: ["gluten", "wheat", "barley", "rye", "spelt", "oats", "cereals"],
    terms: [
      ts("gluten"),
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
      // `word`, weil `oats` als Substring in "goats cheese" steckt und einem
      // glutenallergischen Kind Ziegenkäse als bedenklich meldete.
      t("oats", "word"),
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
    // `shellfish` steht bewusst auch bei `molluscs`: umgangssprachlich deckt
    // der Begriff beide Gruppen ab, und ein Code, der nur einer Seite
    // zugeordnet ist, ließe die andere fälschlich als sicher durchgehen.
    declaredCodes: ["crustaceans", "crustacean", "shellfish"],
    terms: [
      t("garnele"),
      t("krabbe"),
      t("hummer"),
      t("scampi"),
      ts("krebs"),
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
      ts("ei", "word"),
      ts("eier", "word"),
      t("eigelb"),
      t("eiweiss"),
      t("eiernudeln"),
      t("mayonnaise"),
      ts("egg", "word"),
      ts("eggs", "word"),
      t("yolk"),
      t("albumen"),
    ],
    exclude: [],
  },
  {
    key: "fish",
    declaredCodes: ["fish"],
    terms: [
      ts("fisch"),
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
    terms: [ts("erdnuss"), ts("erdnuesse"), ts("peanut"), t("groundnut"), t("arachis")],
    exclude: [],
  },
  {
    key: "soy",
    declaredCodes: ["soy", "soya", "soybeans"],
    terms: [
      ts("soja"),
      t("tofu"),
      t("edamame"),
      t("miso"),
      t("tempeh"),
      ts("soy"),
      ts("soya"),
      t("soybean"),
    ],
    exclude: [],
  },
  {
    key: "milk",
    declaredCodes: ["milk", "dairy", "lactose"],
    terms: [
      ts("milch"),
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
      ts("milk"),
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
      ts("nuss"),
      t("hazelnut"),
      t("walnut"),
      t("almond"),
      t("pistachio"),
      t("pecan"),
      t("brazil nut"),
      ts("nut", "word"),
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
    terms: [ts("sellerie"), ts("celery"), t("celeriac")],
    exclude: [],
  },
  {
    key: "mustard",
    declaredCodes: ["mustard"],
    terms: [ts("senf"), t("dijon"), ts("mustard")],
    exclude: [],
  },
  {
    key: "sesame",
    declaredCodes: ["sesame", "sesame_seeds"],
    terms: [ts("sesam"), t("tahin"), t("hummus"), ts("sesame"), t("tahini")],
    exclude: [],
  },
  {
    key: "sulphites",
    declaredCodes: ["sulphites", "sulfites", "sulphur_dioxide"],
    terms: [
      ts("sulfit"),
      t("schwefeldioxid"),
      t("trockenfruechte"),
      t("wein"),
      ts("sulphite"),
      ts("sulfite"),
      t("wine", "word"),
    ],
    // "Schweinefleisch" enthält den Term `wein`.
    exclude: ["schwein"],
  },
  {
    key: "lupin",
    declaredCodes: ["lupin"],
    terms: [ts("lupine"), t("lupinenmehl"), ts("lupin")],
    exclude: [],
  },
  {
    key: "molluscs",
    declaredCodes: ["molluscs", "mollusks", "shellfish"],
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
  /** Siehe `Term.self`. */
  readonly self: boolean;
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
  terms: spec.terms.map((term) => ({
    text: fold(term.text),
    mode: term.mode ?? "substring",
    self: term.self ?? false,
  })),
  exclude: spec.exclude.map(fold),
}));

/**
 * Ein Code kann auf **mehrere** Keys zeigen. `shellfish` etwa deckt
 * umgangssprachlich Krebs- und Weichtiere ab; wäre er nur einem Key
 * zugeordnet, ergäbe ein Rezept mit `contains_allergens: ["shellfish"]` für
 * eine weichtierallergische Familie `safe` — der Code wäre bekannt, träfe aber
 * am Allergen vorbei.
 */
const DECLARED_INDEX = ALLERGEN_SPECS.reduce((index, spec) => {
  for (const code of spec.declaredCodes) {
    const folded = fold(code);
    index.set(folded, [...(index.get(folded) ?? []), spec.key]);
  }
  return index;
}, new Map<string, AllergenKey[]>());

/**
 * Ein Code aus `recipes.contains_allergens` → alle Keys, die er bedeuten kann.
 * Groß- und Kleinschreibung sowie Trennzeichen sind egal; ein leeres Ergebnis
 * heißt "kennen wir nicht" und wird vom Urteil bewusst nicht als Entwarnung
 * gewertet.
 */
export function keysForDeclaredCode(code: string): AllergenKey[] {
  // Kopie, nicht die Referenz aus dem Index: `.sort()` und `.push()` arbeiten
  // in place, ein Aufrufer würde damit das Vokabular für alle folgenden
  // Urteile umschreiben. Der Testfall zu `shellfish` sortiert das Ergebnis
  // tatsächlich — dort fiele es nur nicht auf, weil die Liste schon sortiert ist.
  return DECLARED_INDEX.get(fold(code))?.slice() ?? [];
}

/**
 * Kennen wir diesen Code? Ein unbekannter Code darf `safe` verhindern — er
 * könnte in einem fremden Vokabular genau das Allergen benennen, nach dem
 * gesucht wird.
 */
export function isKnownDeclaredCode(code: string): boolean {
  const folded = fold(code);
  return DECLARED_INDEX.has(folded);
}
