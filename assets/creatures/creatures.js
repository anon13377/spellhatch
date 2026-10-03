// Creature roster for Spell Hatch (card W1-I). All art is original, hand-written SVG.
export const CREATURES = [
  { id: "c00", name: "Sprig", color: "#ffa94d", blurb: "A sprout fox who grows a new leaf with every lesson." },
  { id: "c01", name: "Nimbo", color: "#8ec5f5", blurb: "A soft cloud puff that giggles and floats along." },
  { id: "c02", name: "Pebbo", color: "#8d95ad", blurb: "A shy pebble turtle who hums while hiding in its shell." },
  { id: "c03", name: "Bloop", color: "#ff9ad5", blurb: "A wobbly jelly bubble that bounces and sparkles." },
  { id: "c04", name: "Starlo", color: "#6b6fd6", blurb: "A sleepy owl who collects tiny stars at night." },
  { id: "c05", name: "Embo", color: "#5b4560", blurb: "A cozy volcano newt with glowing ember spots on its back." },
  { id: "c06", name: "Flurry", color: "#bcd8ff", blurb: "A fluffy snow bunny who loves to hop in flurries." },
  { id: "c07", name: "Mossle", color: "#9b7455", blurb: "A cozy mole with a mossy hat and a tiny pink nose." },
  { id: "c08", name: "Scuttle", color: "#ff8a7a", blurb: "A bubbly crab who clicks its claws to say hello." },
  { id: "c09", name: "Jolty", color: "#b8e04a", blurb: "A zippy lime pup who loves to bounce and play." },
  { id: "c10", name: "Sprinkle", color: "#ff9fc6", blurb: "A sweet candy slug that leaves sparkly sprinkle trails." },
  { id: "c11", name: "Luma", color: "#8a6ee0", blurb: "A cuddly moon bat that glides softly through the night." }
];

export function creatureSrc(id, state) {
  return "./assets/creatures/" + id + "-" + state + ".svg";
}
