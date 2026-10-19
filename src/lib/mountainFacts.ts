export const MOUNTAIN_FACTS = {
  name: 'Mt. Kalisungan', municipality: 'Calauan', province: 'Laguna', place: 'Calauan, Laguna',
  elevationMeters: 760, elevationFeet: 2493, difficulty: 'Moderate overall',
  typicalHikingTime: '2.5 to 4 hours to the summit, depending on the published route and pace',
  jumpOffs: ['Lamot 1', 'Lamot 2', 'Sto. Tomas'], center: [14.1475, 121.3454] as [number, number],
  summit: [14.14669032170505, 121.34512701965895] as [number, number],
} as const;
export const MOUNTAIN_ELEVATION_LABEL = `${MOUNTAIN_FACTS.elevationMeters} MASL`;
export const MOUNTAIN_ELEVATION_FEET_LABEL = `${MOUNTAIN_FACTS.elevationFeet.toLocaleString('en-US')} ft`;
