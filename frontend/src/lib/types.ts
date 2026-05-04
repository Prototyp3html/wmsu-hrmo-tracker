export type UserRole = "admin" | "staff";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}

export interface Department {
  id: string;
  name: string;
}

export interface JobVacancy {
  id: string;
  positionTitle: string;
  departmentId: string;
  plantillaNo?: string;
  monthlyRate?: string;
  salaryGrade: number;
  description?: string;
  eligibility?: string;
  trainings?: string;
  competencies?: string;
  educationalBackground?: string;
  workExperience?: string;
  qualifications: string;
  postingDate: string;
  closingDate: string;
  status: "Open" | "Closed" | "Filled";
  positionLevel?: "first_level" | "second_level";
}

export type ApplicationStatus =
  | "Application Received"
  | "Under Initial Screening"
  | "For Examination"
  | "For Interview"
  | "For Final Evaluation"
  | "Approved"
  | "Hired"
  | "Rejected";

export interface Applicant {
  id: string;
  fullName: string;
  contactNumber: string;
  telephoneNumber: string;
  email: string;
  address: string;
  permanentAddress: string;
  dateOfBirth: string;
  placeOfBirth: string;
  sex: string;
  civilStatus: string;
  citizenship: string;
  height: string;
  weight: string;
  bloodType: string;
  gsisIdNo: string;
  philsysNo: string;
  pagibigIdNo: string;
  philhealthNo: string;
  citizenshipDetails: string;
  sssNo: string;
  tinNo: string;
  agencyEmployeeNo: string;
  spouseName: string;
  spouseSurname: string;
  spouseFirstName: string;
  spouseMiddleName: string;
  spouseNameExtension: string;
  spouseOccupation: string;
  spouseEmployerBusinessName: string;
  spouseBusinessAddress: string;
  spouseTelephoneNo: string;
  childrenInfo: string;
  fatherName: string;
  fatherSurname: string;
  fatherFirstName: string;
  fatherMiddleName: string;
  fatherNameExtension: string;
  motherName: string;
  motherSurname: string;
  motherFirstName: string;
  motherMiddleName: string;
  civilServiceEligibility: string;
  voluntaryWork: string;
  trainings: string;
  otherInfo: string;
  referencesInfo: string;
  educationalBackground: string;
  workExperience: string;
  applicationId?: string;
}

export interface Application {
  id: string;
  applicantId: string;
  vacancyId: string;
  status: ApplicationStatus;
  dateApplied: string;
  remarks?: string;
  documentsComplete?: boolean;
  examScheduleDate?: string;
  examScheduleTime?: string;
  examVenue?: string;
  interviewScheduleDate?: string;
  interviewScheduleTime?: string;
  interviewVenue?: string;
  finalEvaluationDate?: string;
  finalEvaluationTime?: string;
  finalEvaluationVenue?: string;
}

export interface StatusHistory {
  id: string;
  applicationId: string;
  status: ApplicationStatus;
  remarks: string;
  updatedBy: string;
  updatedAt: string;
}

export interface Evaluation {
  id: string;
  applicationId: string;
  positionLevel: "first_level" | "second_level";
  communicationSkills?: number;
  abilityToPresent?: number;
  alertness?: number;
  judgement?: number;
  emotionalStability?: number;
  selfConfidence?: number;
  firstLevelTotal?: number;
  oralCommunication?: number;
  analyticalAbility?: number;
  initiative?: number;
  stressTolerance?: number;
  sensitivity?: number;
  serviceOrientation?: number;
  secondLevelTotal?: number;
  totalScore: number;
  remarks: string;
  evaluatedBy: string;
  evaluatedAt: string;
}

export interface ApplicantDocument {
  id: string;
  applicantId: string;
  docType: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  url: string;
}

export interface ParsedApplicantDraft {
  fullName: string;
  contactNumber: string;
  telephoneNumber: string;
  email: string;
  address: string;
  permanentAddress: string;
  dateOfBirth: string;
  placeOfBirth: string;
  sex: string;
  civilStatus: string;
  citizenship: string;
  height: string;
  weight: string;
  bloodType: string;
  gsisIdNo: string;
  philsysNo: string;
  pagibigIdNo: string;
  philhealthNo: string;
  citizenshipDetails: string;
  sssNo: string;
  tinNo: string;
  agencyEmployeeNo: string;
  spouseName: string;
  spouseSurname: string;
  spouseFirstName: string;
  spouseMiddleName: string;
  spouseNameExtension: string;
  spouseOccupation: string;
  spouseEmployerBusinessName: string;
  spouseBusinessAddress: string;
  spouseTelephoneNo: string;
  childrenInfo: string;
  fatherName: string;
  fatherSurname: string;
  fatherFirstName: string;
  fatherMiddleName: string;
  fatherNameExtension: string;
  motherName: string;
  motherSurname: string;
  motherFirstName: string;
  motherMiddleName: string;
  civilServiceEligibility: string;
  voluntaryWork: string;
  trainings: string;
  otherInfo: string;
  referencesInfo: string;
  educationalBackground: string;
  workExperience: string;
  rawTextLength: number;
}

export interface AuditLog {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  action: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface EmailTemplate {
  templateKey: "not_qualified" | "non_teaching" | "teaching" | "qualification_notice" | "hired";
  templateName: string;
  templateGroup: "rejection" | "qualification";
  subject: string;
  body: string;
  updatedAt: string;
}
