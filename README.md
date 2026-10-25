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

## How the pages were used

Stereochemistry Practice was built to be worked through together in class, then assigned as practice at
home. The other two are for studying on your own; each ends with challenges.

## For instructors

- Chair Lab is a single file: its 3D viewer ([3Dmol.js](https://3dmol.org/), BSD license) is
  embedded in the page, so it loads nothing from other sites.
- The two stereochemistry pages use [JSmol](https://jmol.sourceforge.net/) and load it from
  St. Olaf College's public JSmol server (`chemapps.stolaf.edu/jmol/jsmol`), so they need an internet
  connection and depend on that server being up. A copy of JSmol can be placed in this repository
  to remove that dependency.
- The pages cite the sections of the open textbook they follow: [OpenStax Organic
  Chemistry](https://openstax.org/details/books/organic-chemistry), chapters 4 (cyclohexane) and 5
  (stereochemistry).
- The repository is published with GitHub Pages from the `main` branch, so every file is served at
  `https://neogio73.github.io/CHM2210/` followed by its name.
