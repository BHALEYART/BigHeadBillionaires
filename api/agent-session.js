// /api/agent-session.js
// Vercel serverless function — converts a soul file trait config into
// pre-seeded Customizer + Animator URLs for OpenClaw agents.
//
// POST /api/agent-session
// Body: { traits: { BODY, HEAD, EYES, MOUTH, OUTFIT, TEXTURE, BACKGROUND }, female?: bool, slot?: 1|2 }
// Returns: { customizerUrl, animatorUrl, indices }

// Canonical trait arrays — must stay in sync with customizer.html TRAITS object
const TRAITS = {
  EYES: [
    'Curious.png','Alien.png','Annoyed.png','Demonic.png','Diamond.png','Dots.png',
    'Grumpy.png','Hypnotized.png','Infuriated.png','Insect.png','Joy.png',
    'Light Bright.png','Monocle.png','Ouchy.png','Paranoid.png','Possessed.png',
    'Ruby Stare.png','Spider.png','Stare.png','Stoney Eyes.png','Sunglasses.png',
    'Surprised.png','Tears.png','Deceased.png','Too Chill.png','VR Headset.png',
    '3D Glasses.png','Blink.png','Stern.png','Tears.gif'
  ],
  MOUTH: [
    'Mmm.png','Simpleton.png','Stache.png','Creeper.png','Pierced.png','Fangs.png',
    'Gold Teeth.png','Diamond Teeth.png','CandyGrill.png','Birdy.png','Panic.png','Sss.png','Ahh.png',
    'Ehh.png','Uhh.png','LLL.png','Rrr.png','Fff.png','Ooo.png','Thh.png','Eee.png',
    'Haha.png','Rofl.png','Bean Frown.png','Bean Smile.png','Smirk.png','Bored.png',
    'Gas Mask.png','Scuba.png','Quacked.png'
  ],
  HEAD: [
    'None.png','Antenna.png','Bandana Bro.png','Beanie.png','Blonde Beanie.png',
    'Blonde Bun.png','Blue Bedhead.png','Brain Squid.png','Bravo.png','Brunette Beanie.png',
    'Brunette Ponytail.png','Burger Crown.png','Captain Hat.png','Mullet.png','Cat Hat.png',
    'Chad Bandana.png','Cherry Sundae.png','Clown Wig.png','Fancy Hat.png','Fireman.png',
    'Flame Princess.png','Fossilized.png','Gamer Girl.png','Ginger Ponytail.png','Kpop.png',
    'Yagami.png','Raven.png','Heated.png','Inferno.png','Horny Horns.png','Hunted.png',
    'Jester.png','Kingly.png','Mad Hatter.png','Masked Up.png','Mohawk Blue.png',
    'Mohawk Green.png','Mohawk Red.png','Mortricia.png','Outlaw.png','Overload.png',
    'Patrol Cap.png','Pharaoh Hat.png','Pink Pigtails.png','Powdered Wig.png','Press Pass.png',
    'Propeller.png','Rainbow Babe.png','Recon Helmet.png','Robin Hood.png','Santa Hat.png',
    'Sewer Slime.png','Snapback Blue.png','Snapback Hippy.png','Snapback Red.png',
    'Snapback Yellow.png','Sombrero.png','Spiritual.png','Surgeon.png','UwU Kitty.png',
    'Valhalla Cap.png','Way Dizzy.png','FoxFamous.png','Unplugged.png'
  ],
  OUTFIT: [
    'None.png','Blue Tee.png','Blueberry Dye.png','Degen Green.png','Degen Purple.png',
    'Earthy Dye.png','Hodl Black.png','Hodl White.png','Locked Up.png','Moto-X.png',
    'Orange Zip.png','Passion Dye.png','Pink Zip.png','Raider Ref.png','Red Tee.png',
    'Smally Bigs.png','Yellow Tee.png','Blue Zip.png','Red Zip.png','White Zip.png',
    'Hornet Zip.png','Ghostly Zip.png','Gold Jacket.png','Tuxedo.png','Thrashed.png',
    'The Fuzz.png','Pin Striped.png','Designer Zip.png','Luxury Zip.png','Explorer.png',
    'Power Armor.png','Shinobi.png','Thrilled.png','Trenches.png','Ski Jacket.png',
    'Sled Jacket.png','Commando.png','Space Cadet.png','Burgler.png','Commandant.png',
    'Golden Knight.png','Honey Bee.png','Necromancer.png','Paladin.png','Refined Suit.png',
    'Sexy Jacket.png','Stoner Hoodie.png','The Duke.png','Rave Hoodie.png',
    'Scuba suit temp.png','Burger Suit.png','Scrubs.png','FlaredUp.png','Shiller.png'
  ],
  TEXTURE: [
    'None.png','Blood.png','Acid.png','Ink.png','Dart Frog Blue.png','Dart Frog Red.png',
    'Dart Frog Yellow.png','Magical.png','Puzzled.png','Rug Life Ink.png','Pulverized.png',
    'FlaredInk.png'
  ],
  BODY: [
    'Blank.png','Charcoal.png','High Voltage.png','Nebulous.png','Pinky.png',
    'Shockwave.png','Tangerine.png','Turquoise.png','Woody.png','Frogger.png',
    'Area 51.png','Dark Tone.png','Mid Tone.png','Light Tone.png','Jolly Roger.png',
    'Cyber Punk.png','Talking Corpse.png','Day Tripper.png','Meat Lover.png',
    'Golden God.png','Chrome Dome.png','Candy Gloss.png','Man On Fire.png','Water Boy.png',
    'Icecream Man.png','Reptilian.png','Juiced Up.png','Toxic Waste.png','Love Potion.png',
    'Pop Artist.png','Autopsy.png','Ghostly.png','Blue Screen.png','Networker.png',
    'IceMan.png','TheLizard.png','Primal.png','PanduBeru.png'
  ],
  BACKGROUNDS: [
    'None.png','Natural.png','Mania.png','Regal.png','Lavish.png','Sunflower.png',
    'Snowflake.png','Bleach.png','Vibes.png','Burst.png','Aquatic.png','Passionate.png',
    'Envious.png','Enlightened.png','Haunted.png','Cursed.png','SolFlare.png','Tangerine.png',
    'Navy.png','Crimson.png','Graphite.png','Eggshell.png','Slate.png','Kuwai.png',
    'Velvet.png','Money.png','Sky.png'
  ]
};

// Map incoming soul file slot key → internal TRAITS key
// Soul files use BACKGROUND (singular), customizer uses BACKGROUNDS
const KEY_MAP = {
  BACKGROUND: 'BACKGROUNDS',
  BACKGROUNDS: 'BACKGROUNDS',
  BODY: 'BODY',
  HEAD: 'HEAD',
  EYES: 'EYES',
  MOUTH: 'MOUTH',
  OUTFIT: 'OUTFIT',
  TEXTURE: 'TEXTURE',
};

function resolveIndex(cat, name) {
  const files = TRAITS[cat];
  if (!files) return 0;
  // Try exact match with .png
  let idx = files.findIndex(f => f === name + '.png');
  if (idx >= 0) return idx;
  // Try case-insensitive
  idx = files.findIndex(f => f.toLowerCase() === (name + '.png').toLowerCase());
  if (idx >= 0) return idx;
  // Try without extension (in case agent passed full filename)
  idx = files.findIndex(f => f.toLowerCase() === name.toLowerCase());
  if (idx >= 0) return idx;
  // Default to None or 0
  const noneIdx = files.findIndex(f => f.toLowerCase() === 'none.png');
  return noneIdx >= 0 ? noneIdx : 0;
}

export default function handler(req, res) {
  // CORS — allow agent requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { traits = {}, female = false, slot = 1 } = req.body;

    // Convert trait names → numeric indices
    const indices = {};
    // Set defaults first (None / 0 for each category)
    Object.keys(TRAITS).forEach(cat => {
      const noneIdx = TRAITS[cat].findIndex(f => f.toLowerCase() === 'none.png');
      indices[cat] = noneIdx >= 0 ? noneIdx : 0;
    });

    // Apply provided traits
    Object.entries(traits).forEach(([rawKey, name]) => {
      const cat = KEY_MAP[rawKey.toUpperCase()];
      if (!cat) return; // unknown key — skip
      indices[cat] = resolveIndex(cat, name);
    });

    // Build the localStorage payload (same format both tools expect)
    const cfg = {
      indices,
      female: !!female,
      overlay: { color: null, opacity: 50 },
      savedAt: Date.now(),
      slot,
    };

    // Encode as base64 for URL param
    const encoded = Buffer.from(JSON.stringify(cfg)).toString('base64');

    const base = 'https://bigheadbillionaires.com';
    const customizerUrl = `${base}/customizer/?agent=${encoded}&slot=${slot}`;
    const animatorUrl   = `${base}/animator/?agent=${encoded}&slot=${slot}`;

    return res.status(200).json({
      customizerUrl,
      animatorUrl,
      indices,       // returned for agent verification
      slot,
    });

  } catch (e) {
    console.error('agent-session error:', e);
    return res.status(500).json({ error: e.message });
  }
}
