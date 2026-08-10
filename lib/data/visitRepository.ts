import visitsJson from "../../data/visit_history.json";
import type { Visit } from "../domain/visit";

export interface VisitRepository {
  findByPersonIds(personIds: string[]): Promise<Visit[]>;
  findByPersonId(personId: string): Promise<Visit[]>;
}

const visits = visitsJson as Visit[];

const newestFirst = (a: Visit, b: Visit) =>
  b.visited_at.localeCompare(a.visited_at);

export class JsonVisitRepository implements VisitRepository {
  async findByPersonIds(personIds: string[]) {
    const idSet = new Set(personIds);
    return visits.filter((visit) => idSet.has(visit.person_id)).sort(newestFirst);
  }

  async findByPersonId(personId: string) {
    return visits
      .filter((visit) => visit.person_id === personId)
      .sort(newestFirst);
  }
}

export const visitRepository: VisitRepository = new JsonVisitRepository();
