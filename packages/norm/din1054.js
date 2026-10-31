// @ws/norm – Normprofil DIN EN 1997-1 + NA / DIN 1054:2021, Bemessungssituation BS-P.
// Andere Normprofile (ÖNORM, PN EN) implementieren dieselbe Struktur.

/** @typedef {{id:string, label:string, situation:string,
 *   geo2:{G:number, Gfav:number, Q:number}, equ:{Gdst:number, Gstb:number, Qdst:number},
 *   str:{G:number, Q:number}, R:{h:number, v:number}, refs:Record<string,string>}} NormProfile */

/** @type {NormProfile} */
export const DIN1054_BSP = {
  id: 'DIN1054-BS-P',
  label: 'DIN 1054:2021 · BS-P',
  situation: 'BS-P',
  // Tab. A2.1 (Einwirkungen) – GEO-2 und STR
  geo2: { G: 1.35, Gfav: 1.0, Q: 1.5 },
  // Tab. A2.1 – EQU (Kippen)
  equ: { Gdst: 1.1, Gstb: 0.9, Qdst: 1.5 },
  str: { G: 1.35, Q: 1.5 },
  // Tab. A2.3 – Widerstände: Gleiten γR,h, Grundbruch γR,v
  R: { h: 1.1, v: 1.4 },
  refs: {
    equ: 'DIN 1054 A 2.4.7.2, Tab. A2.1',
    sliding: 'DIN EN 1997-1 6.5.3, DIN 1054 A 6.5.3',
    bearing: 'DIN 4017:2006, DIN 1054 A 6.5.2',
    eccentricity: 'DIN 1054 A 6.6.5',
    earth: 'DIN 4085:2017, EAB',
  },
};

export const NORMS = { [DIN1054_BSP.id]: DIN1054_BSP };
