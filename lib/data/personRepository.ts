import personsJson from "../../data/persons.json";
import careProfilesJson from "../../data/care_profiles.json";
import type { CareProfile, Person } from "../domain/person";

export interface PersonRepository {
  findAll(): Promise<Person[]>;
  findById(personId: string): Promise<Person | null>;
  findByPhone(phone: string): Promise<Person[]>;
  findByTranscript(transcript: string): Promise<Person[]>;
  getCareProfile(personId: string): Promise<CareProfile | null>;
}

const persons = personsJson as Person[];
const careProfiles = careProfilesJson as CareProfile[];

const normalizePhone = (value: string) => value.replace(/\D/g, "");

export class JsonPersonRepository implements PersonRepository {
  async findAll() {
    return persons;
  }

  async findById(personId: string) {
    return persons.find((person) => person.person_id === personId) ?? null;
  }

  async findByPhone(phone: string) {
    const normalized = normalizePhone(phone);
    if (!normalized) return [];
    return persons.filter(
      (person) => normalizePhone(person.phone) === normalized,
    );
  }

  async findByTranscript(transcript: string) {
    return persons.filter((person) => transcript.includes(person.name));
  }

  async getCareProfile(personId: string) {
    return (
      careProfiles.find((profile) => profile.person_id === personId) ?? null
    );
  }
}

export const personRepository: PersonRepository = new JsonPersonRepository();
