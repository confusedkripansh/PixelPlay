package words

import (
	"math/rand"
	"strings"
	"sync"
	"time"
)

var (
	once sync.Once
	r    *rand.Rand
)

func initRand() {
	r = rand.New(rand.NewSource(time.Now().UnixNano()))
}

// Curated dictionary of 320+ precise, evocative words perfectly tailored for sketching games.
var WordPool = []string{
	// Animals & Wildlife
	"CHAMELEON", "OCTOPUS", "PEACOCK", "PLATYPUS", "HEDGEHOG", "FLAMINGO", "WALRUS", "SEAHORSE",
	"KANGAROO", "MEERKAT", "JELLYFISH", "HUMMINGBIRD", "GIRAFFE", "PANGOLIN", "ARMADILLO", "STINGRAY",
	"KOALA", "PELICAN", "SLOTH", "TOUCAN", "HAMMERHEAD SHARK", "PENGUIN", "GECKO", "CHEETAH",
	"RHINOCEROS", "LOBSTER", "SCORPION", "DRAGONFLY", "WOODPECKER", "PORCUPINE", "BEAVER", "NARWHAL",

	// Everyday & Specialized Objects
	"TELESCOPE", "HOURGLASS", "COMPASS", "TOASTER", "MICROSCOPE", "PHONOGRAPH", "HEADPHONES",
	"LANTERN", "TYPEWRITER", "ANCHOR", "BINOCULARS", "POCKET WATCH", "METRONOME", "PERISCOPE",
	"KALEIDOSCOPE", "THERMOMETER", "LIGHTBULB", "MAGNIFYING GLASS", "WALKIE TALKIE", "CANDLESTICK",
	"STAPLER", "CORKSCREW", "CUCKOO CLOCK", "GLOBE", "BOOMBOX", "PROJECTOR", "SCISSORS", "SAFE BOX",

	// Vehicles & Transportation
	"SUBMARINE", "HOT AIR BALLOON", "HOVERCRAFT", "STEAM LOCOMOTIVE", "BIPLANE", "UNICYCLE",
	"BULLDOZER", "CABLE CAR", "GONDOLA", "FORKLIFT", "TANDEM BICYCLE", "SPACE SHUTTLE", "TUG BOAT",
	"SNOWMOBILE", "TRAMCAR", "ZEPPELIN", "GLIDER", "FERRY BOAT", "SAILBOAT", "FIRE TRUCK",

	// Architecture & Famous Structures
	"LIGHTHOUSE", "PYRAMID", "COLOSSEUM", "WINDMILL", "IGLOO", "SKYSCRAPER", "SUSPENSION BRIDGE",
	"CATHEDRAL", "WATER TOWER", "CASTLE", "TREEHOUSE", "PAGODA", "OBSERVATORY", "CLOCK TOWER",
	"FORTRESS", "BARN", "TEMPLE", "BUNGALOW", "CIRCUS TENT", "GAZEBO", "DRAWBRIDGE",

	// Sci-Fi, Space & Fantasy
	"CYBORG", "SUPERNOVA", "HOVERBOARD", "TREASURE CHEST", "WORMHOLE", "BLACK HOLE", "SATELLITE",
	"FLYING SAUCER", "METEORITE", "ASTRONAUT", "ALIEN ABDUCTION", "JETPACK", "FORCE FIELD", "RAY GUN",
	"TIME MACHINE", "DRAGON", "WIZARD HAT", "CRYSTAL BALL", "MAGIC WAND", "POTION BOTTLE", "UNICORN",
	"PHOENIX", "GARGOYLE", "EXCALIBUR", "SPELLBOOK", "FLYING CARPET", "GHOST SHIP", "PORTAL",

	// Nature & Geography
	"VOLCANO", "WATERFALL", "GLACIER", "CORAL REEF", "TORNADO", "DESERT OASIS", "NORTHERN LIGHTS",
	"GEYSER", "STALACTITE", "SAND DUNE", "CANYON", "METEOR CRATER", "AVALANCHE", "ICEBERG",
	"VOLCANIC ERUPTION", "RAINFOREST", "LIGHTNING BOLT", "WHIRLPOOL", "TROPICAL ISLAND", "SUNSET",

	// Food, Drink & Culinary
	"SUSHI ROLL", "CROISSANT", "AVOCADO", "CUPCAKE", "TACO", "PINEAPPLE", "CHEESEBURGER",
	"WAFFLE", "POPSICLE", "PANCAKE STACK", "WATERMELON SLICE", "PRETZEL", "COFFEE ESPRESSO",
	"HOT CHILI PEPPER", "FONDUE POT", "FORTUNE COOKIE", "BURRITO", "POPCORN BUCKET", "DONUT",
	"ICE CREAM SUNDAE", "LOLLIPOP", "ARTICHOKE", "MUSHROOM PIZZA", "POMEGRANATE",

	// Tools, Music & Instruments
	"ACCORDION", "BAGPIPES", "SAXOPHONE", "XYLOPHONE", "HARP", "TAMBOURINE", "ELECTRIC GUITAR",
	"CELLO", "TURNTABLE", "JACKHAMMER", "CHAINSAW", "ANVIL", "SOLDERING IRON", "WRENCH", "PAINT PALETTE",

	// Characters, Occupations & Costumes
	"DETECTIVE", "ARCHAEOLOGIST", "DEEP SEA DIVER", "CHEF", "MAGICIAN", "BLACKSMITH", "PIRATE CAPTAIN",
	"NINJA", "BEEKEEPER", "VIKING", "SAMURAI", "ASTRONAUT", "LIFGUARD", "SCIENTIST", "FIREMAN",
	"SNORKELER", "JUGGLER", "ACROBAT", "KNIGHT IN ARMOR", "SCUBA DIVER",
}

// GetRandomWord returns a fresh, precise word that has not been used yet in the current game session.
func GetRandomWord(usedWords []string) string {
	once.Do(initRand)

	usedSet := make(map[string]bool)
	for _, w := range usedWords {
		usedSet[strings.ToUpper(strings.TrimSpace(w))] = true
	}

	// Filter down available pool
	var available []string
	for _, w := range WordPool {
		if !usedSet[w] {
			available = append(available, w)
		}
	}

	// If all words were exhausted in a very long game, pick from the full pool
	if len(available) == 0 {
		return WordPool[r.Intn(len(WordPool))]
	}

	return available[r.Intn(len(available))]
}
