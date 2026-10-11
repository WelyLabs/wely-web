/** A point on Earth, in decimal degrees: what wely-events stores and the map shows. */
export interface Coordinates {
    latitude: number;
    longitude: number;
}

/** A place picked on the map: the text shown to people, and where it is. */
export interface Place {
    label: string;
    coordinates: Coordinates;
}

/** The area a map shows, in decimal degrees. */
export interface MapArea {
    south: number;
    west: number;
    north: number;
    east: number;
}
