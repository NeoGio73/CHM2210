# CHM 2210: Organic Chemistry I

Interactive pages for a first-semester organic chemistry course. Everything runs in a web browser,
with nothing to install and no account to create. Nothing is graded or recorded.

**Students:** these pages are linked from the course, and that is the best place to open them. The
list is here if you want to come back and practice.

| Topic | Page | What it is |
| --- | --- | --- |
| Cyclohexane conformations | [Chair Lab](https://neogio73.github.io/CHM2210/chair-lab.html) | Explore a 3D chair, read axial and equatorial positions, flip the ring, then take the chair challenges |
| Stereochemistry | [Stereochemistry Lab](https://neogio73.github.io/CHM2210/stereochemistry-lab.html) | Explore a tetrahedral center, rank its groups and read R or S, compare two stereocenters, then the challenges on enantiomers, diastereomers and meso compounds |
| Stereochemistry | [Stereochemistry Practice](https://neogio73.github.io/CHM2210/stereochemistry-practice.html) | R/S and E/Z on 3D models of real molecules (ibuprofen, menthol, L-cysteine, substituted alkenes), with a results page and the questions to review |
| Alkene reactions | [Chapter 8 Flashcards](https://neogio73.github.io/CHM2210/flashcards/ch08-alkenes.html) | 94 flip cards on alkene additions (HX, hydration, rearrangements, oxymercuration, hydroboration, X₂, halohydrins, epoxides, diols, cleavage, carbenes), some with rotatable 3D models; sort cards into "Got it" and "Review again" piles |
| Alkyne reactions | [Chapter 9 Flashcards](https://neogio73.github.io/CHM2210/flashcards/ch09-alkynes.html) | 66 flip cards on alkynes (naming, preparation, X₂ and HX, hydration and tautomers, reductions, cleavage, acidity, alkylation, synthesis), some with rotatable 3D models |

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
- The pages cite the sections of the open textbook they follow: [OpenStax Organic
  Chemistry](https://openstax.org/details/books/organic-chemistry), chapters 4 (cyclohexane) and 5
  (stereochemistry).
- The repository is published with GitHub Pages from the `main` branch, so every file is served at
  `https://neogio73.github.io/CHM2210/` followed by its name.
