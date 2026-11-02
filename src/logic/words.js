// Concrete, easy-to-picture nouns for memory palace practice.
// Bundled with the app so practice works offline.
export const WORDS = `
anchor apple apron arrow axe backpack badger bagel balloon banana banjo barrel basket bathtub battery beach ball
beard bee beetle bell belt bench bicycle binoculars blanket blender boat bone book boot bottle bow tie bowl
box bracelet bread brick bridge broom bubble bucket bulldozer bus butter butterfly button cactus cake calculator
camel camera candle cannon canoe cap car carrot castle cat caterpillar cauliflower chain chair cheese cherry
chess board chicken chimney chocolate cigar clock cloud clown coat coconut coffee coin comb compass cookie
corn cow crab crane crayon crocodile crown cucumber cup cupcake curtain cushion daisy deer desk diamond dice
dinosaur dog doll dolphin donkey door doughnut dragon drum duck dumbbell eagle egg elephant envelope eraser
fan feather fence fire engine fish flag flamingo flashlight flower flute football fork fountain fox frog
frying pan garlic ghost giraffe glasses globe glove goat goldfish gorilla grapes guitar hammer hammock hamster
handbag harp hat hedgehog helicopter helmet hippo honey horse hose hot dog ice cream igloo iron jacket jam
jeans jellyfish jigsaw kangaroo kettle key keyboard kite kiwi knife koala ladder ladybird lamp lantern lemon
lettuce lighthouse lion lipstick lizard lobster lock lollipop magnet mango map marble mask matchbox mattress
medal megaphone mermaid microphone microscope milk mirror mitten monkey moon motorbike mouse mug mushroom
nail necklace needle nest net newspaper notebook octopus onion orange ostrich owl paintbrush palm tree pancake
panda parachute parrot passport peach peacock peanut pear pen pencil penguin pepper piano pickle pie pig
pillow pineapple pirate pizza plate pliers pony popcorn potato pram pumpkin puppet purse rabbit racket radio
rainbow rake rat robot rocket rope rose rubber duck ruler saddle sandwich satellite sausage saw saxophone
scarecrow scarf scissors scooter screwdriver seahorse seal shark sheep shell shoe shovel skateboard skeleton
skull sledge slipper snail snake snowman sock sofa spaghetti spider sponge spoon squirrel stapler starfish
statue stethoscope strawberry submarine suitcase sunflower surfboard swan sword syringe table taco tank teapot
teddy bear telescope tent tiger toaster toilet tomato toothbrush torch tortoise tractor traffic cone train
trampoline treasure chest tree trophy trumpet tulip turkey tyre umbrella unicorn vacuum vase violin volcano
waffle wallet walrus wand wardrobe watch watering can watermelon whale wheelbarrow whistle wig windmill
wizard wolf worm yacht yo-yo zebra zip
`;

// Multi-word items are listed with spaces above; group them back together.
const MULTI = [
  'beach ball', 'bow tie', 'chess board', 'fire engine', 'frying pan', 'hot dog', 'ice cream', 'palm tree',
  'rubber duck', 'teddy bear', 'traffic cone', 'treasure chest', 'watering can'
];

function buildList() {
  let text = WORDS.replace(/\s+/g, ' ').trim();
  for (const m of MULTI) text = text.split(m).join(m.replace(' ', '_'));
  return [...new Set(text.split(' ').map((w) => w.replace('_', ' ')))];
}

export const WORD_LIST = buildList();
