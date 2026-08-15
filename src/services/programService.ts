import { DatabaseService, type Program } from './firebase';

export interface ProgramDates {
  applicationStart: string;
  applicationEnd: string;
  programStart: string;
  programEnd: string;
  decisionsBy: string;
}

export class ProgramService {
  static async getAllPrograms(): Promise<Program[]> {
    return await DatabaseService.getAllPrograms();
  }

  static async getProgram(slug: string): Promise<Program | null> {
    return await DatabaseService.getProgram(slug);
  }

  static async updateProgramDates(programId: string, dates: ProgramDates): Promise<void> {
    await DatabaseService.updateProgram(programId, { dates });
  }

  static async updateProgram(programId: string, updates: Partial<Program>): Promise<void> {
    await DatabaseService.updateProgram(programId, updates);
  }

  static formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  static isApplicationOpen(program: Program): boolean {
    const now = new Date();
    const startDate = new Date(program.dates.applicationStart);
    const endDate = new Date(program.dates.applicationEnd);
    return now >= startDate && now <= endDate;
  }

  static getApplicationStatus(program: Program): 'open' | 'closed' | 'upcoming' {
    const now = new Date();
    const startDate = new Date(program.dates.applicationStart);
    const endDate = new Date(program.dates.applicationEnd);

    if (now < startDate) return 'upcoming';
    if (now > endDate) return 'closed';
    return 'open';
  }
}

export default ProgramService;
