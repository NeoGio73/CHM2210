# CHM 2210: Organic Chemistry I

Interactive pages for a first-semester organic chemistry course. Everything runs in a web browser,
with nothing to install and no account to create. Nothing is graded or recorded.

**Students:** these pages are linked from the course, and that is the best place to open them. The
list is here if you want to come back and practice.

| Topic | Page | What it is |
| --- | --- | --- |
| Key terms, chapters 1–11 | [Orgo Word Lattice](https://neogio73.github.io/CHM2210/word-lattice.html) | A 3D word search: key terms from chapters 1–11 hidden along straight lines through a rotating cube of letters, including lines through the middle; find them from clues or from a word list, with three cube sizes and three difficulty levels |
| Cyclohexane conformations | [Chair Lab](https://neogio73.github.io/CHM2210/chair-lab.html) | Explore a 3D chair, read axial and equatorial positions, flip the ring, then take the chair challenges |
| Stereochemistry | [Stereochemistry Lab](https://neogio73.github.io/CHM2210/stereochemistry-lab.html) | Explore a tetrahedral center, rank its groups and read R or S, compare two stereocenters, then the challenges on enantiomers, diastereomers and meso compounds |
| Stereochemistry | [Stereochemistry Practice](https://neogio73.github.io/CHM2210/stereochemistry-practice.html) | R/S and E/Z on 3D models of real molecules (ibuprofen, menthol, L-cysteine, substituted alkenes), with a results page and the questions to review |
| Alkene reactions | [Chapter 8 Flashcards](https://neogio73.github.io/CHM2210/flashcards/ch08-alkenes.html) | 94 flip cards on alkene additions (HX, hydration, rearrangements, oxymercuration, hydroboration, X₂, halohydrins, epoxides, diols, cleavage, carbenes), some with rotatable 3D models; sort cards into "Got it" and "Review again" piles |
| Alkyne reactions | [Chapter 9 Flashcards](https://neogio73.github.io/CHM2210/flashcards/ch09-alkynes.html) | 66 flip cards on alkynes (naming, preparation, X₂ and HX, hydration and tautomers, reductions, cleavage, acidity, alkylation, synthesis), some with rotatable 3D models |
| Polymers | [Polymers & the Surf Zone](https://neogio73.github.io/CHM2210/polymers-surf-zone.html) | Chain-growth and step-growth polymers with monomer and repeat-unit structures, tacticity, rubber and copolymers; then the chemistry of surfboards and paddleboards, wave and board physics with slider labs, East Florida surf, tides and sharks, and practice problems with three help levels |
| Waves (just for fun) | [Mavericks Big Wave](https://neogio73.github.io/CHM2210/mavericks/) | Surf Mavericks, Half Moon Bay, on four real big-swell days: the reef from NOAA's seabed survey, the waves from a wave model run on the buoy's readings; paddle in, drop, and ride the wall to the channel, with speed and wave height on screen, a replay, and phone controls |

## How the pages were used

Stereochemistry Practice was built to be worked through together in class, then assigned as practice at
home. The other two are for studying on your own; each ends with challenges.

## For instructors

- Chair Lab is a single file: its 3D viewer ([3Dmol.js](https://3dmol.org/), BSD license) is
  embedded in the page, so it loads nothing from other sites.
- The two stereochemistry pages use [JSmol](https://jmol.sourceforge.net/) (Jmol 16.5.5, LGPL),
  served from the `jsmol/` folder in this repository, so they load nothing from other sites. The
  folder holds the HTML5 part of the JSmol distribution (`JSmol.min.js`, `j2s/`, `idioma/`); the
  demo pages, data files and Java applet are left out.
- The flashcard decks live in the `flashcards/` folder, one file per chapter (`ch08-alkenes.html`, and so on).
  Each deck is a single file: its structures are drawn in the page and its 3D models use a small viewer
  built into the page. Only the fonts load from Google Fonts. A student's Got it / Review marks are saved
  in their own browser and are not sent anywhere.
- Orgo Word Lattice is a single file. It loads [three.js](https://threejs.org/) (r128, MIT license) from cdnjs and its
  fonts from Google Fonts. Its term list is a plain-text block near the top of `word-lattice.html`, one term per
  line as `chapter | answer | clue`. Only the answer's letters go into the cube, so an answer needs 3 to 12 letters.
  After an edit, open the page and look under "New lattice": it says how many terms loaded and lists any skipped line.
- Polymers & the Surf Zone is a single file. Its structures were drawn with RDKit and its photos are
  embedded in the page, so only the fonts load from Google Fonts. Photo credits: Mavericks by Shalom
  Jacobovitz ([CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)), Teahupo'o by Olivier
  Dugornay / Ifremer ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0)), both resized; the
  Mavericks bathymetry map is from the U.S. Geological Survey with the CSUMB Seafloor Mapping Lab.
- Mavericks Big Wave lives in the `mavericks/` folder (`index.html`, its scripts and `data/`). It loads
  [three.js](https://threejs.org/) (r169, MIT license) from jsDelivr; everything else is in the folder. The reef and the
  cliffs are NOAA's CUDEM 1/9 arc-second topobathy model (public domain); the swell, tide and sun for each day come
  from NOAA buoy 46012, NOAA's Pillar Point tide predictions and a wave model run on the seabed. Sail Rock is placed
  from the Coast Guard's rule for the contest (33 CFR 100.1106); the other rocks and Pillar Point Air Force Station
  were placed from public satellite pictures and shaped by hand. Some things are chosen rather than measured: the
  peel speed, the length of the wall, the shape of the lip, and the height of the rocks.
- The pages cite the sections of the open textbook they follow: [OpenStax Organic
  Chemistry](https://openstax.org/details/books/organic-chemistry), chapters 4 (cyclohexane), 5
  (stereochemistry), 8 and 9 (alkenes and alkynes), and 31 (synthetic polymers; radical polymerization
  is in section 8.10). Orgo Word Lattice uses the Key Terms lists of chapters 1–11, with clues written for the puzzle.
- The repository is published with GitHub Pages from the `main` branch, so every file is served at
  `https://neogio73.github.io/CHM2210/` followed by its name.
