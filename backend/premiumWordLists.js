/**
 * Listes de mots thématiques exclusives Premium, utilisées en mode
 * "Thèmes" (voir isValidFreeWord dans wordList.js — ces mots passent tous
 * cette validation, ce sont des mots anglais ordinaires, juste organisés en
 * thèmes pratiques plutôt que tapés librement un par un). Chaque mot a sa
 * traduction française, comme demandé.
 *
 * Le mode gratuit reste : les 80 objets caméra (wordList.js/VALID_WORDS) +
 * "Taper n'importe quel mot" en illimité (n'importe quel mot anglais). Ces
 * listes n'enlèvent rien à personne — elles ajoutent une manière organisée
 * et guidée de pratiquer un vocabulaire ciblé, réservée aux comptes Premium.
 *
 * Sur le mot "infini" : une vraie liste infinie n'a pas vraiment de sens
 * pour du contenu curé à la main (il faudrait un dictionnaire externe, avec
 * un risque de mots mal choisis ou mal traduits). On a donc massivement
 * élargi la couverture ici (12 thèmes, ~200 mots) — et pour aller au-delà,
 * le mode "Taper n'importe quel mot" reste illimité pour absolument
 * n'importe quel mot anglais, avec sa traduction française récupérée à la
 * volée (voir translate.js) : la combinaison des deux couvre en pratique
 * un vocabulaire quasi illimité, sans sacrifier la qualité des thèmes curés.
 */
const PREMIUM_WORD_LISTS = [
  {
    id: "business",
    title: "Anglais professionnel",
    emoji: "💼",
    words: [
      { en: "meeting", fr: "réunion" }, { en: "deadline", fr: "date limite" },
      { en: "budget", fr: "budget" }, { en: "invoice", fr: "facture" },
      { en: "client", fr: "client" }, { en: "negotiate", fr: "négocier" },
      { en: "contract", fr: "contrat" }, { en: "revenue", fr: "revenu" },
      { en: "strategy", fr: "stratégie" }, { en: "colleague", fr: "collègue" },
      { en: "presentation", fr: "présentation" }, { en: "schedule", fr: "planning" },
      { en: "manager", fr: "responsable" }, { en: "employee", fr: "employé" },
      { en: "salary", fr: "salaire" }, { en: "interview", fr: "entretien" },
      { en: "resume", fr: "CV" }, { en: "promotion", fr: "promotion" },
    ],
  },
  {
    id: "travel",
    title: "Voyage",
    emoji: "✈️",
    words: [
      { en: "passport", fr: "passeport" }, { en: "luggage", fr: "bagages" },
      { en: "boarding", fr: "embarquement" }, { en: "customs", fr: "douane" },
      { en: "itinerary", fr: "itinéraire" }, { en: "reservation", fr: "réservation" },
      { en: "departure", fr: "départ" }, { en: "airport", fr: "aéroport" },
      { en: "currency", fr: "devise" }, { en: "hostel", fr: "auberge" },
      { en: "journey", fr: "voyage" }, { en: "souvenir", fr: "souvenir" },
      { en: "ticket", fr: "billet" }, { en: "visa", fr: "visa" },
      { en: "destination", fr: "destination" }, { en: "layover", fr: "escale" },
    ],
  },
  {
    id: "numbers",
    title: "Nombres & dates",
    emoji: "🔢",
    words: [
      { en: "eleven", fr: "onze" }, { en: "twelve", fr: "douze" },
      { en: "twenty", fr: "vingt" }, { en: "thirty", fr: "trente" },
      { en: "forty", fr: "quarante" }, { en: "hundred", fr: "cent" },
      { en: "thousand", fr: "mille" }, { en: "million", fr: "million" },
      { en: "yesterday", fr: "hier" }, { en: "tomorrow", fr: "demain" },
      { en: "weekend", fr: "week-end" }, { en: "quarter", fr: "trimestre" },
      { en: "monday", fr: "lundi" }, { en: "january", fr: "janvier" },
      { en: "century", fr: "siècle" }, { en: "decade", fr: "décennie" },
    ],
  },
  {
    id: "food-advanced",
    title: "Cuisine avancée",
    emoji: "🍽️",
    words: [
      { en: "vinaigrette", fr: "vinaigrette" }, { en: "casserole", fr: "cocotte" },
      { en: "marinade", fr: "marinade" }, { en: "garnish", fr: "garniture" },
      { en: "simmer", fr: "mijoter" }, { en: "sauté", fr: "sauter (cuisson)" },
      { en: "appetizer", fr: "entrée" }, { en: "beverage", fr: "boisson" },
      { en: "ingredient", fr: "ingrédient" }, { en: "recipe", fr: "recette" },
      { en: "seasoning", fr: "assaisonnement" }, { en: "leftovers", fr: "restes" },
      { en: "simmering", fr: "mijotage" }, { en: "grill", fr: "griller" },
      { en: "whisk", fr: "fouet" }, { en: "dessert", fr: "dessert" },
    ],
  },
  {
    id: "home",
    title: "Maison",
    emoji: "🏠",
    words: [
      { en: "kitchen", fr: "cuisine" }, { en: "bedroom", fr: "chambre" },
      { en: "bathroom", fr: "salle de bain" }, { en: "living room", fr: "salon" },
      { en: "furniture", fr: "meubles" }, { en: "curtain", fr: "rideau" },
      { en: "carpet", fr: "tapis" }, { en: "ceiling", fr: "plafond" },
      { en: "staircase", fr: "escalier" }, { en: "basement", fr: "sous-sol" },
      { en: "garage", fr: "garage" }, { en: "backyard", fr: "arrière-cour" },
      { en: "landlord", fr: "propriétaire" }, { en: "tenant", fr: "locataire" },
      { en: "rent", fr: "loyer" }, { en: "neighbor", fr: "voisin" },
    ],
  },
  {
    id: "health",
    title: "Santé",
    emoji: "🩺",
    words: [
      { en: "doctor", fr: "médecin" }, { en: "nurse", fr: "infirmier" },
      { en: "appointment", fr: "rendez-vous" }, { en: "prescription", fr: "ordonnance" },
      { en: "symptom", fr: "symptôme" }, { en: "headache", fr: "mal de tête" },
      { en: "fever", fr: "fièvre" }, { en: "medicine", fr: "médicament" },
      { en: "pharmacy", fr: "pharmacie" }, { en: "surgery", fr: "chirurgie" },
      { en: "vaccine", fr: "vaccin" }, { en: "emergency", fr: "urgence" },
      { en: "injury", fr: "blessure" }, { en: "recovery", fr: "guérison" },
      { en: "insurance", fr: "assurance" }, { en: "checkup", fr: "bilan de santé" },
    ],
  },
  {
    id: "technology",
    title: "Technologie",
    emoji: "💻",
    words: [
      { en: "keyboard", fr: "clavier" }, { en: "screen", fr: "écran" },
      { en: "software", fr: "logiciel" }, { en: "hardware", fr: "matériel" },
      { en: "download", fr: "télécharger" }, { en: "upload", fr: "envoyer (upload)" },
      { en: "password", fr: "mot de passe" }, { en: "network", fr: "réseau" },
      { en: "battery", fr: "batterie" }, { en: "charger", fr: "chargeur" },
      { en: "application", fr: "application" }, { en: "browser", fr: "navigateur" },
      { en: "database", fr: "base de données" }, { en: "server", fr: "serveur" },
      { en: "update", fr: "mise à jour" }, { en: "wireless", fr: "sans fil" },
    ],
  },
  {
    id: "sport",
    title: "Sport",
    emoji: "🏅",
    words: [
      { en: "referee", fr: "arbitre" }, { en: "stadium", fr: "stade" },
      { en: "championship", fr: "championnat" }, { en: "opponent", fr: "adversaire" },
      { en: "training", fr: "entraînement" }, { en: "victory", fr: "victoire" },
      { en: "defeat", fr: "défaite" }, { en: "coach", fr: "entraîneur" },
      { en: "teammate", fr: "coéquipier" }, { en: "score", fr: "score" },
      { en: "goalkeeper", fr: "gardien de but" }, { en: "marathon", fr: "marathon" },
      { en: "gymnasium", fr: "gymnase" }, { en: "athlete", fr: "athlète" },
    ],
  },
  {
    id: "emotions",
    title: "Émotions",
    emoji: "😊",
    words: [
      { en: "happy", fr: "heureux" }, { en: "sad", fr: "triste" },
      { en: "excited", fr: "enthousiaste" }, { en: "nervous", fr: "nerveux" },
      { en: "proud", fr: "fier" }, { en: "confused", fr: "confus" },
      { en: "grateful", fr: "reconnaissant" }, { en: "frustrated", fr: "frustré" },
      { en: "curious", fr: "curieux" }, { en: "relieved", fr: "soulagé" },
      { en: "jealous", fr: "jaloux" }, { en: "confident", fr: "confiant" },
      { en: "embarrassed", fr: "gêné" }, { en: "surprised", fr: "surpris" },
    ],
  },
  {
    id: "clothing",
    title: "Vêtements",
    emoji: "👕",
    words: [
      { en: "shirt", fr: "chemise" }, { en: "trousers", fr: "pantalon" },
      { en: "jacket", fr: "veste" }, { en: "sweater", fr: "pull" },
      { en: "sneakers", fr: "baskets" }, { en: "scarf", fr: "écharpe" },
      { en: "gloves", fr: "gants" }, { en: "belt", fr: "ceinture" },
      { en: "dress", fr: "robe" }, { en: "hat", fr: "chapeau" },
      { en: "socks", fr: "chaussettes" }, { en: "pajamas", fr: "pyjama" },
      { en: "raincoat", fr: "imperméable" }, { en: "wardrobe", fr: "garde-robe" },
    ],
  },
  {
    id: "weather",
    title: "Météo",
    emoji: "🌦️",
    words: [
      { en: "sunny", fr: "ensoleillé" }, { en: "cloudy", fr: "nuageux" },
      { en: "rainy", fr: "pluvieux" }, { en: "windy", fr: "venteux" },
      { en: "storm", fr: "orage" }, { en: "thunder", fr: "tonnerre" },
      { en: "lightning", fr: "éclair" }, { en: "temperature", fr: "température" },
      { en: "humidity", fr: "humidité" }, { en: "forecast", fr: "prévisions" },
      { en: "drought", fr: "sécheresse" }, { en: "blizzard", fr: "blizzard" },
      { en: "rainbow", fr: "arc-en-ciel" }, { en: "frost", fr: "givre" },
    ],
  },
  {
    id: "transport",
    title: "Transport",
    emoji: "🚦",
    words: [
      { en: "highway", fr: "autoroute" }, { en: "intersection", fr: "carrefour" },
      { en: "pedestrian", fr: "piéton" }, { en: "traffic jam", fr: "embouteillage" },
      { en: "roundabout", fr: "rond-point" }, { en: "commute", fr: "trajet domicile-travail" },
      { en: "subway", fr: "métro" }, { en: "platform", fr: "quai" },
      { en: "fare", fr: "tarif" }, { en: "license", fr: "permis" },
      { en: "parking lot", fr: "parking" }, { en: "seatbelt", fr: "ceinture de sécurité" },
      { en: "steering wheel", fr: "volant" }, { en: "gas station", fr: "station-service" },
    ],
  },
];

function getPremiumWordListsMeta() {
  // Version "teaser" pour les comptes gratuits : titres et nombre de mots
  // visibles (pour donner envie), mais jamais le contenu réel des listes.
  return PREMIUM_WORD_LISTS.map(({ id, title, emoji, words }) => ({
    id, title, emoji, wordCount: words.length,
  }));
}

module.exports = { PREMIUM_WORD_LISTS, getPremiumWordListsMeta };
