export interface Person {
  person_id: string;
  name: string;
  phone: string;
  birth_year: number;
  address: string;
}

export interface CareProfile {
  person_id: string;
  mobility_notes: string[];
  preferences: string[];
  contact_notes: string[];
}
