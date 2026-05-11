import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createApplicant,
  createApplication,
  fetchApplicants,
  fetchApplications,
  fetchJobs,
  updateApplicant,
  uploadApplicantDocument,
  parseApplicantDocument,
  fetchApplicantDocuments,
  getFileUrl
} from "@/lib/api";
import type { Applicant, ApplicantDocument, Application, ParsedApplicantDraft } from "@/lib/types";
import { getStatusColor } from "@/lib/status";
import { Plus, Search, Mail, Phone, MapPin, GraduationCap, Briefcase, Upload, Check, ChevronsUpDown, Download, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";

type NameParts = {
  firstName: string;
  middleName: string;
  lastName: string;
  extensionName: string;
};

type AddressParts = {
  regionCode: string;
  cityCode: string;
  barangayCode: string;
  streetAddress: string;
};

type ChildEntry = {
  fullName: string;
  dateOfBirth: string;
};

type EducationEntry = {
  level: string;
  schoolName: string;
  degreeCourse: string;
  attendanceFrom: string;
  attendanceTo: string;
  highestLevelUnitsEarned: string;
  yearGraduated: string;
  scholarshipHonors: string;
};

type CivilServiceEntry = {
  eligibility: string;
  rating: string;
  examDate: string;
  examPlace: string;
  licenseNumber: string;
  licenseValidUntil: string;
};

type WorkExperienceEntry = {
  dateFrom: string;
  dateTo: string;
  positionTitle: string;
  departmentAgencyOfficeCompany: string;
  statusOfAppointment: string;
  isGovtService: "Y" | "N" | "";
};

type VoluntaryWorkEntry = {
  organizationNameAddress: string;
  dateFrom: string;
  dateTo: string;
  numberOfHours: string;
  positionNatureOfWork: string;
};

type TrainingEntry = {
  title: string;
  dateFrom: string;
  dateTo: string;
  numberOfHours: string;
  typeOfLd: string;
  conductedSponsoredBy: string;
};

type OtherInfoEntry = {
  specialSkillsHobbies: string;
  nonAcademicDistinctionsRecognition: string;
  membershipsAssociationOrganization: string;
};

type RegionUnit = {
  code: string;
  name: string;
};

type LocalityUnit = {
  code: string;
  name: string;
  type: "city" | "municipality";
};

type BarangayUnit = {
  code: string;
  name: string;
};

type SearchableOption = {
  value: string;
  label: string;
};

const addressSuggestions = [
  "Zamboanga City, Zamboanga del Sur",
  "Zamboanga del Norte",
  "Zamboanga del Sur",
  "Manila, Metro Manila",
  "Mandaluyong, Metro Manila",
  "Mango Ave, General Santos City",
  "Magallanes Village, Makati City",
  "Manggahan, Pasig City",
  "Main Street, Barangay Central, Zamboanga City",
  "Manuel A. Roxas St, Zamboanga City",
  "Barangay 1, Zamboanga City"
];

const PSGC_BASE_URL = "https://psgc.gitlab.io/api";

function normalizeLocationText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeMatchedAddressPart(baseAddress: string, matchedPart?: string) {
  if (!matchedPart) return baseAddress;
  const escaped = matchedPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return baseAddress.replace(new RegExp(escaped, "ig"), "").replace(/\s{2,}/g, " ").replace(/^,|,$/g, "").trim();
}

function formatFullName(parts: NameParts) {
  return [parts.firstName.trim(), parts.middleName.trim(), parts.lastName.trim(), parts.extensionName.trim()]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatAddress(streetAddress: string, barangayName: string, cityName: string, regionName: string) {
  return [streetAddress.trim(), barangayName.trim(), cityName.trim(), regionName.trim()].filter(Boolean).join(", ");
}

function normalizeDateForInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})/);
  if (!match) return trimmed;

  const pad = (value: number) => String(value).padStart(2, "0");
  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = Number(match[3]);

  if (match[1].length === 4) {
    return `${match[1]}-${pad(second)}-${pad(third)}`;
  }

  if (match[3].length === 4) {
    if (first > 12 && second <= 12) {
      return `${match[3]}-${pad(second)}-${pad(first)}`;
    }

    if (second > 12 && first <= 12) {
      return `${match[3]}-${pad(first)}-${pad(second)}`;
    }

    return `${match[3]}-${pad(first)}-${pad(second)}`;
  }

  return trimmed;
}

function normalizeChoice(value: string, allowed: string[]) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const matched = allowed.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  return matched ?? trimmed;
}

function splitFullName(fullName: string): NameParts {
  const suffixes = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", middleName: "", lastName: "", extensionName: "" };
  }

  let extensionName = "";
  const lastToken = parts[parts.length - 1]?.toLowerCase();
  if (lastToken && suffixes.has(lastToken)) {
    extensionName = parts.pop() ?? "";
  }

  const firstName = parts[0] ?? "";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  const middleName = parts.length > 2 ? parts.slice(1, -1).join(" ") : "";

  return {
    firstName,
    middleName,
    lastName,
    extensionName
  };
}

function serializeChildrenInfo(entries: ChildEntry[]) {
  return entries
    .filter((entry) => entry.fullName.trim() || entry.dateOfBirth)
    .map((entry) => `${entry.fullName.trim()}|${entry.dateOfBirth}`)
    .join("\n");
}

function parseChildrenInfo(value: string): ChildEntry[] {
  if (!value.trim()) {
    return [{ fullName: "", dateOfBirth: "" }];
  }

  const parsed = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [fullNamePart, dateOfBirthPart = ""] = line.split("|");
      return {
        fullName: fullNamePart.trim(),
        dateOfBirth: dateOfBirthPart.trim()
      };
    });

  return parsed.length > 0 ? parsed : [{ fullName: "", dateOfBirth: "" }];
}

const defaultEducationLevels = [
  "Elementary",
  "Secondary",
  "Vocational / Trade Course",
  "College",
  "Graduate Studies"
];

function createEducationEntry(level = ""): EducationEntry {
  return {
    level,
    schoolName: "",
    degreeCourse: "",
    attendanceFrom: "",
    attendanceTo: "",
    highestLevelUnitsEarned: "",
    yearGraduated: "",
    scholarshipHonors: ""
  };
}

function buildDefaultEducationEntries(): EducationEntry[] {
  return defaultEducationLevels.map((level) => createEducationEntry(level));
}

function serializeEducationalBackground(entries: EducationEntry[]) {
  return entries
    .filter((entry) =>
      entry.level.trim() ||
      entry.schoolName.trim() ||
      entry.degreeCourse.trim() ||
      entry.attendanceFrom ||
      entry.attendanceTo ||
      entry.highestLevelUnitsEarned.trim() ||
      entry.yearGraduated.trim() ||
      entry.scholarshipHonors.trim()
    )
    .map((entry) => [
      entry.level.trim(),
      entry.schoolName.trim(),
      entry.degreeCourse.trim(),
      entry.attendanceFrom,
      entry.attendanceTo,
      entry.highestLevelUnitsEarned.trim(),
      entry.yearGraduated.trim(),
      entry.scholarshipHonors.trim()
    ].join("|"))
    .join("\n");
}

function parseEducationalBackground(value: string): EducationEntry[] {
  if (!value.trim()) {
    return buildDefaultEducationEntries();
  }

  const parsed = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const segments = line.split("|");
      if (segments.length < 2) {
        return {
          ...createEducationEntry(),
          schoolName: line
        };
      }

      const [
        level = "",
        schoolName = "",
        degreeCourse = "",
        attendanceFrom = "",
        attendanceTo = "",
        highestLevelUnitsEarned = "",
        yearGraduated = "",
        scholarshipHonors = ""
      ] = segments;

      return {
        level,
        schoolName,
        degreeCourse,
        attendanceFrom,
        attendanceTo,
        highestLevelUnitsEarned,
        yearGraduated,
        scholarshipHonors
      };
    });

  return parsed.length > 0 ? parsed : buildDefaultEducationEntries();
}

function createCivilServiceEntry(): CivilServiceEntry {
  return {
    eligibility: "",
    rating: "",
    examDate: "",
    examPlace: "",
    licenseNumber: "",
    licenseValidUntil: ""
  };
}

function serializeCivilServiceEligibility(entries: CivilServiceEntry[]) {
  return entries
    .filter((entry) =>
      entry.eligibility.trim() ||
      entry.rating.trim() ||
      entry.examDate ||
      entry.examPlace.trim() ||
      entry.licenseNumber.trim() ||
      entry.licenseValidUntil
    )
    .map((entry) => [
      entry.eligibility.trim(),
      entry.rating.trim(),
      entry.examDate,
      entry.examPlace.trim(),
      entry.licenseNumber.trim(),
      entry.licenseValidUntil
    ].join("|"))
    .join("\n");
}

function parseCivilServiceEligibility(value: string): CivilServiceEntry[] {
  if (!value.trim()) {
    return [createCivilServiceEntry()];
  }

  const parsed = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|");
      if (parts.length < 2) {
        return {
          ...createCivilServiceEntry(),
          eligibility: line
        };
      }

      const [
        eligibility = "",
        rating = "",
        examDate = "",
        examPlace = "",
        licenseNumber = "",
        licenseValidUntil = ""
      ] = parts;

      return {
        eligibility,
        rating,
        examDate,
        examPlace,
        licenseNumber,
        licenseValidUntil
      };
    });

  return parsed.length > 0 ? parsed : [createCivilServiceEntry()];
}

function createWorkExperienceEntry(): WorkExperienceEntry {
  return {
    dateFrom: "",
    dateTo: "",
    positionTitle: "",
    departmentAgencyOfficeCompany: "",
    statusOfAppointment: "",
    isGovtService: ""
  };
}

function serializeWorkExperience(entries: WorkExperienceEntry[]) {
  return entries
    .filter((entry) =>
      entry.dateFrom ||
      entry.dateTo ||
      entry.positionTitle.trim() ||
      entry.departmentAgencyOfficeCompany.trim() ||
      entry.statusOfAppointment.trim() ||
      entry.isGovtService
    )
    .map((entry) => [
      entry.dateFrom,
      entry.dateTo,
      entry.positionTitle.trim(),
      entry.departmentAgencyOfficeCompany.trim(),
      entry.statusOfAppointment.trim(),
      entry.isGovtService
    ].join("|"))
    .join("\n");
}

function parseWorkExperience(value: string): WorkExperienceEntry[] {
  if (!value.trim()) {
    return [createWorkExperienceEntry()];
  }

  const parsed = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|");
      if (parts.length < 2) {
        return {
          ...createWorkExperienceEntry(),
          positionTitle: line
        };
      }

      const [
        dateFrom = "",
        dateTo = "",
        positionTitle = "",
        departmentAgencyOfficeCompany = "",
        statusOfAppointment = "",
        isGovtService = ""
      ] = parts;

      return {
        dateFrom,
        dateTo,
        positionTitle,
        departmentAgencyOfficeCompany,
        statusOfAppointment,
        isGovtService: (isGovtService === "Y" || isGovtService === "N" ? isGovtService : "") as "" | "Y" | "N"
      };
    });

  return parsed.length > 0 ? parsed : [createWorkExperienceEntry()];
}

function createVoluntaryWorkEntry(): VoluntaryWorkEntry {
  return {
    organizationNameAddress: "",
    dateFrom: "",
    dateTo: "",
    numberOfHours: "",
    positionNatureOfWork: ""
  };
}

function serializeVoluntaryWork(entries: VoluntaryWorkEntry[]) {
  return entries
    .filter((entry) =>
      entry.organizationNameAddress.trim() ||
      entry.dateFrom ||
      entry.dateTo ||
      entry.numberOfHours.trim() ||
      entry.positionNatureOfWork.trim()
    )
    .map((entry) => [
      entry.organizationNameAddress.trim(),
      entry.dateFrom,
      entry.dateTo,
      entry.numberOfHours.trim(),
      entry.positionNatureOfWork.trim()
    ].join("|"))
    .join("\n");
}

function parseVoluntaryWork(value: string): VoluntaryWorkEntry[] {
  if (!value.trim()) {
    return [createVoluntaryWorkEntry()];
  }

  const parsed = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|");
      if (parts.length < 2) {
        return {
          ...createVoluntaryWorkEntry(),
          organizationNameAddress: line
        };
      }

      const [
        organizationNameAddress = "",
        dateFrom = "",
        dateTo = "",
        numberOfHours = "",
        positionNatureOfWork = ""
      ] = parts;

      return {
        organizationNameAddress,
        dateFrom,
        dateTo,
        numberOfHours,
        positionNatureOfWork
      };
    });

  return parsed.length > 0 ? parsed : [createVoluntaryWorkEntry()];
}

function createTrainingEntry(): TrainingEntry {
  return {
    title: "",
    dateFrom: "",
    dateTo: "",
    numberOfHours: "",
    typeOfLd: "",
    conductedSponsoredBy: ""
  };
}

function serializeTrainings(entries: TrainingEntry[]) {
  return entries
    .filter((entry) =>
      entry.title.trim() ||
      entry.dateFrom ||
      entry.dateTo ||
      entry.numberOfHours.trim() ||
      entry.typeOfLd.trim() ||
      entry.conductedSponsoredBy.trim()
    )
    .map((entry) => [
      entry.title.trim(),
      entry.dateFrom,
      entry.dateTo,
      entry.numberOfHours.trim(),
      entry.typeOfLd.trim(),
      entry.conductedSponsoredBy.trim()
    ].join("|"))
    .join("\n");
}

function parseTrainings(value: string): TrainingEntry[] {
  if (!value.trim()) {
    return [createTrainingEntry()];
  }

  const parsed = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|");
      if (parts.length < 2) {
        return {
          ...createTrainingEntry(),
          title: line
        };
      }

      const [
        title = "",
        dateFrom = "",
        dateTo = "",
        numberOfHours = "",
        typeOfLd = "",
        conductedSponsoredBy = ""
      ] = parts;

      return {
        title,
        dateFrom,
        dateTo,
        numberOfHours,
        typeOfLd,
        conductedSponsoredBy
      };
    });

  return parsed.length > 0 ? parsed : [createTrainingEntry()];
}

function createOtherInfoEntry(): OtherInfoEntry {
  return {
    specialSkillsHobbies: "",
    nonAcademicDistinctionsRecognition: "",
    membershipsAssociationOrganization: ""
  };
}

function serializeOtherInfo(entries: OtherInfoEntry[]) {
  return entries
    .filter((entry) =>
      entry.specialSkillsHobbies.trim() ||
      entry.nonAcademicDistinctionsRecognition.trim() ||
      entry.membershipsAssociationOrganization.trim()
    )
    .map((entry) => [
      entry.specialSkillsHobbies.trim(),
      entry.nonAcademicDistinctionsRecognition.trim(),
      entry.membershipsAssociationOrganization.trim()
    ].join("|"))
    .join("\n");
}

function parseOtherInfo(value: string): OtherInfoEntry[] {
  if (!value.trim()) {
    return [createOtherInfoEntry()];
  }

  const parsed = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|");
      if (parts.length < 2) {
        return {
          ...createOtherInfoEntry(),
          specialSkillsHobbies: line
        };
      }

      const [
        specialSkillsHobbies = "",
        nonAcademicDistinctionsRecognition = "",
        membershipsAssociationOrganization = ""
      ] = parts;

      return {
        specialSkillsHobbies,
        nonAcademicDistinctionsRecognition,
        membershipsAssociationOrganization
      };
    });

  return parsed.length > 0 ? parsed : [createOtherInfoEntry()];
}

type ApplicantExportLineKind = "title" | "section" | "subsection" | "bullet" | "text";

type ApplicantExportLine = {
  text: string;
  kind: ApplicantExportLineKind;
};

function formatExportValue(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "N/A";
}

function hasMeaningfulValue(value: string | undefined | null) {
  return Boolean(value?.trim());
}

function buildApplicantExportLines(applicant: Applicant, applications: Application[], documents: ApplicantDocument[]) {
  const lines: ApplicantExportLine[] = [];
  const push = (text: string, kind: ApplicantExportLineKind = "text") => {
    lines.push({ text, kind });
  };
  const pushField = (label: string, value: string | undefined | null) => {
    push(`${label}: ${formatExportValue(value)}`, "bullet");
  };

  const children = parseChildrenInfo(applicant.childrenInfo || "").filter((child) => hasMeaningfulValue(child.fullName) || hasMeaningfulValue(child.dateOfBirth));
  const educationRows = parseEducationalBackground(applicant.educationalBackground || "").filter((row) =>
    hasMeaningfulValue(row.level) ||
    hasMeaningfulValue(row.schoolName) ||
    hasMeaningfulValue(row.degreeCourse) ||
    hasMeaningfulValue(row.attendanceFrom) ||
    hasMeaningfulValue(row.attendanceTo) ||
    hasMeaningfulValue(row.highestLevelUnitsEarned) ||
    hasMeaningfulValue(row.yearGraduated) ||
    hasMeaningfulValue(row.scholarshipHonors)
  );
  const civilServiceRows = parseCivilServiceEligibility(applicant.civilServiceEligibility || "").filter((row) =>
    hasMeaningfulValue(row.eligibility) || hasMeaningfulValue(row.rating) || hasMeaningfulValue(row.examDate) || hasMeaningfulValue(row.examPlace) || hasMeaningfulValue(row.licenseNumber) || hasMeaningfulValue(row.licenseValidUntil)
  );
  const workRows = parseWorkExperience(applicant.workExperience || "").filter((row) =>
    hasMeaningfulValue(row.positionTitle) || hasMeaningfulValue(row.departmentAgencyOfficeCompany) || hasMeaningfulValue(row.dateFrom) || hasMeaningfulValue(row.dateTo) || hasMeaningfulValue(row.statusOfAppointment) || hasMeaningfulValue(row.isGovtService)
  );
  const voluntaryRows = parseVoluntaryWork(applicant.voluntaryWork || "").filter((row) =>
    hasMeaningfulValue(row.organizationNameAddress) || hasMeaningfulValue(row.dateFrom) || hasMeaningfulValue(row.dateTo) || hasMeaningfulValue(row.numberOfHours) || hasMeaningfulValue(row.positionNatureOfWork)
  );
  const trainingRows = parseTrainings(applicant.trainings || "").filter((row) =>
    hasMeaningfulValue(row.title) || hasMeaningfulValue(row.dateFrom) || hasMeaningfulValue(row.dateTo) || hasMeaningfulValue(row.numberOfHours) || hasMeaningfulValue(row.typeOfLd) || hasMeaningfulValue(row.conductedSponsoredBy)
  );
  const otherInfoRows = parseOtherInfo(applicant.otherInfo || "").filter((row) =>
    hasMeaningfulValue(row.specialSkillsHobbies) || hasMeaningfulValue(row.nonAcademicDistinctionsRecognition) || hasMeaningfulValue(row.membershipsAssociationOrganization)
  );

  push(applicant.fullName || "Applicant Profile", "title");
  push(`Generated: ${new Date().toLocaleString()}`, "text");

  push("I. Personal Information", "section");
  pushField("Full Name", applicant.fullName);
  pushField("Contact Number", applicant.contactNumber);
  pushField("Telephone Number", applicant.telephoneNumber);
  pushField("Email", applicant.email);
  pushField("Address", applicant.address);
  pushField("Permanent Address", applicant.permanentAddress);
  pushField("Date of Birth", applicant.dateOfBirth);
  pushField("Place of Birth", applicant.placeOfBirth);
  pushField("Sex", applicant.sex);
  pushField("Civil Status", applicant.civilStatus);
  pushField("Citizenship", applicant.citizenship);
  pushField("Citizenship Details", applicant.citizenshipDetails);
  pushField("Height", applicant.height);
  pushField("Weight", applicant.weight);
  pushField("Blood Type", applicant.bloodType);
  pushField("GSIS ID No.", applicant.gsisIdNo);
  pushField("PhilSys No.", applicant.philsysNo);
  pushField("PAG-IBIG No.", applicant.pagibigIdNo);
  pushField("PhilHealth No.", applicant.philhealthNo);
  pushField("SSS No.", applicant.sssNo);
  pushField("TIN No.", applicant.tinNo);
  pushField("Agency Employee No.", applicant.agencyEmployeeNo);

  push("II. Family Background", "section");
  push("Spouse Information", "subsection");
  pushField("Name", [applicant.spouseSurname, applicant.spouseFirstName, applicant.spouseMiddleName, applicant.spouseNameExtension].filter(Boolean).join(" "));
  pushField("Occupation", applicant.spouseOccupation);
  pushField("Employer/Business Name", applicant.spouseEmployerBusinessName);
  pushField("Business Address", applicant.spouseBusinessAddress);
  pushField("Telephone", applicant.spouseTelephoneNo);
  push("Father's Information", "subsection");
  pushField("Name", [applicant.fatherSurname, applicant.fatherFirstName, applicant.fatherMiddleName, applicant.fatherNameExtension].filter(Boolean).join(" "));
  push("Mother's Information (Maiden Name)", "subsection");
  pushField("Name", [applicant.motherSurname, applicant.motherFirstName, applicant.motherMiddleName].filter(Boolean).join(" "));
  push("Children", "subsection");
  if (children.length > 0) {
    children.forEach((child, index) => {
      push(`Child ${index + 1}`, "bullet");
      pushField("Full Name", child.fullName);
      pushField("Date of Birth", child.dateOfBirth);
    });
  } else {
    push("No children listed.", "text");
  }

  push("III. Educational Background", "section");
  if (educationRows.length > 0) {
    educationRows.forEach((edu, index) => {
      push(`Education Record ${index + 1}`, "subsection");
      pushField("Level", edu.level);
      pushField("School", edu.schoolName);
      pushField("Degree / Course", edu.degreeCourse);
      pushField("Attendance From", edu.attendanceFrom);
      pushField("Attendance To", edu.attendanceTo);
      pushField("Highest Level / Units Earned", edu.highestLevelUnitsEarned);
      pushField("Year Graduated", edu.yearGraduated);
      pushField("Scholarship / Honors", edu.scholarshipHonors);
    });
  } else {
    push("No educational background listed.", "text");
  }

  push("IV. Civil Service Eligibility", "section");
  if (civilServiceRows.length > 0) {
    civilServiceRows.forEach((entry, index) => {
      push(`Eligibility Record ${index + 1}`, "subsection");
      pushField("Eligibility", entry.eligibility);
      pushField("Rating", entry.rating);
      pushField("Date of Examination / Confinement", entry.examDate);
      pushField("Place of Examination / Confinement", entry.examPlace);
      pushField("License Number", entry.licenseNumber);
      pushField("Date of Validity", entry.licenseValidUntil);
    });
  } else {
    push("No civil service eligibility listed.", "text");
  }

  push("V. Work Experience", "section");
  if (workRows.length > 0) {
    workRows.forEach((entry, index) => {
      push(`Work Record ${index + 1}`, "subsection");
      pushField("Inclusive Dates From", entry.dateFrom);
      pushField("Inclusive Dates To", entry.dateTo);
      pushField("Position Title", entry.positionTitle);
      pushField("Department / Agency / Office / Company", entry.departmentAgencyOfficeCompany);
      pushField("Status of Appointment", entry.statusOfAppointment);
      pushField("Gov't Service", entry.isGovtService === "Y" ? "Yes" : entry.isGovtService === "N" ? "No" : "N/A");
    });
  } else {
    push("No work experience listed.", "text");
  }

  push("VI. Voluntary Work or Involvement in Civic/Non-Government/People/Voluntary Organizations", "section");
  if (voluntaryRows.length > 0) {
    voluntaryRows.forEach((entry, index) => {
      push(`Voluntary Work Record ${index + 1}`, "subsection");
      pushField("Organization Name / Address", entry.organizationNameAddress);
      pushField("Inclusive Dates From", entry.dateFrom);
      pushField("Inclusive Dates To", entry.dateTo);
      pushField("Number of Hours", entry.numberOfHours);
      pushField("Position / Nature of Work", entry.positionNatureOfWork);
    });
  } else {
    push("No voluntary work listed.", "text");
  }

  push("VII. Learning and Development (L&D) Interventions/Training Programs Attended", "section");
  if (trainingRows.length > 0) {
    trainingRows.forEach((entry, index) => {
      push(`Training Record ${index + 1}`, "subsection");
      pushField("Title", entry.title);
      pushField("Inclusive Dates From", entry.dateFrom);
      pushField("Inclusive Dates To", entry.dateTo);
      pushField("Number of Hours", entry.numberOfHours);
      pushField("Type of L&D", entry.typeOfLd);
      pushField("Conducted / Sponsored By", entry.conductedSponsoredBy);
    });
  } else {
    push("No training records listed.", "text");
  }

  push("VIII. Other Information", "section");
  if (otherInfoRows.length > 0) {
    otherInfoRows.forEach((entry, index) => {
      push(`Other Information Record ${index + 1}`, "subsection");
      pushField("Special Skills / Hobbies", entry.specialSkillsHobbies);
      pushField("Non-Academic Distinctions / Recognition", entry.nonAcademicDistinctionsRecognition);
      pushField("Memberships / Associations / Organization", entry.membershipsAssociationOrganization);
    });
  } else {
    push("No other information listed.", "text");
  }
  pushField("References", applicant.referencesInfo);

  push("IX. Applications", "section");
  if (applications.length > 0) {
    applications.forEach((app, index) => {
      push(`Application ${index + 1}`, "subsection");
      pushField("Vacancy ID", app.vacancyId);
      pushField("Status", app.status);
      pushField("Date Applied", app.dateApplied);
      pushField("Remarks", app.remarks);
    });
  } else {
    push("No applications listed.", "text");
  }

  push("X. Submitted Documents", "section");
  if (documents.length > 0) {
    documents.forEach((doc, index) => {
      push(`Document ${index + 1}`, "subsection");
      pushField("Name", doc.originalName);
      pushField("Type", doc.docType);
    });
  } else {
    push("No submitted documents listed.", "text");
  }

  return lines;
}

function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  loadingMessage,
  disabled = false
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  loadingMessage?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between" disabled={disabled}>
          <span className="truncate text-left">{selectedOption?.label || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent portalled={false} className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{loadingMessage ?? emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check className={value === option.value ? "mr-2 h-4 w-4 opacity-100" : "mr-2 h-4 w-4 opacity-0"} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function Applicants() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showView, setShowView] = useState(false);
  const [showCreateApp, setShowCreateApp] = useState(false);
  const [selectedApplicantForApp, setSelectedApplicantForApp] = useState<string | null>(null);
  const [editingApplicantId, setEditingApplicantId] = useState<string | null>(null);
  const [viewingApplicantId, setViewingApplicantId] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    fullName: "",
    contactNumber: "",
    telephoneNumber: "",
    email: "",
    address: "",
    permanentAddress: "",
    dateOfBirth: "",
    placeOfBirth: "",
    sex: "",
    civilStatus: "",
    citizenship: "",
    height: "",
    weight: "",
    bloodType: "",
    gsisIdNo: "",
    philsysNo: "",
    pagibigIdNo: "",
    philhealthNo: "",
    citizenshipDetails: "",
    sssNo: "",
    tinNo: "",
    agencyEmployeeNo: "",
    spouseName: "",
    spouseSurname: "",
    spouseFirstName: "",
    spouseMiddleName: "",
    spouseNameExtension: "",
    spouseOccupation: "",
    spouseEmployerBusinessName: "",
    spouseBusinessAddress: "",
    spouseTelephoneNo: "",
    childrenInfo: "",
    fatherName: "",
    fatherSurname: "",
    fatherFirstName: "",
    fatherMiddleName: "",
    fatherNameExtension: "",
    motherName: "",
    motherSurname: "",
    motherFirstName: "",
    motherMiddleName: "",
    civilServiceEligibility: "",
    voluntaryWork: "",
    trainings: "",
    otherInfo: "",
    referencesInfo: "",
    educationalBackground: "",
    workExperience: ""
  });
  const [nameParts, setNameParts] = useState<NameParts>({
    firstName: "",
    middleName: "",
    lastName: "",
    extensionName: ""
  });
  const [addressParts, setAddressParts] = useState<AddressParts>({
    regionCode: "",
    cityCode: "",
    barangayCode: "",
    streetAddress: ""
  });
  const [regionUnits, setRegionUnits] = useState<RegionUnit[]>([]);
  const [cityUnits, setCityUnits] = useState<LocalityUnit[]>([]);
  const [barangayUnits, setBarangayUnits] = useState<BarangayUnit[]>([]);
  const [isLoadingRegions, setIsLoadingRegions] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [isLoadingBarangays, setIsLoadingBarangays] = useState(false);
  const [editFormState, setEditFormState] = useState({
    fullName: "",
    contactNumber: "",
    telephoneNumber: "",
    email: "",
    address: "",
    permanentAddress: "",
    dateOfBirth: "",
    placeOfBirth: "",
    sex: "",
    civilStatus: "",
    citizenship: "",
    height: "",
    weight: "",
    bloodType: "",
    gsisIdNo: "",
    philsysNo: "",
    pagibigIdNo: "",
    philhealthNo: "",
    citizenshipDetails: "",
    sssNo: "",
    tinNo: "",
    agencyEmployeeNo: "",
    spouseName: "",
    spouseSurname: "",
    spouseFirstName: "",
    spouseMiddleName: "",
    spouseNameExtension: "",
    spouseOccupation: "",
    spouseEmployerBusinessName: "",
    spouseBusinessAddress: "",
    spouseTelephoneNo: "",
    childrenInfo: "",
    fatherName: "",
    fatherSurname: "",
    fatherFirstName: "",
    fatherMiddleName: "",
    fatherNameExtension: "",
    motherName: "",
    motherSurname: "",
    motherFirstName: "",
    motherMiddleName: "",
    civilServiceEligibility: "",
    voluntaryWork: "",
    trainings: "",
    otherInfo: "",
    referencesInfo: "",
    educationalBackground: "",
    workExperience: ""
  });
  const [documents, setDocuments] = useState<{ resume: File | null; transcript: File | null; certificates: File[] }>(
    { resume: null, transcript: null, certificates: [] }
  );
  const [appFormState, setAppFormState] = useState({
    vacancyId: "",
    dateApplied: new Date().toISOString().split("T")[0]
  });
  const [isScanningResume, setIsScanningResume] = useState(false);
  const [isExportingApplicant, setIsExportingApplicant] = useState(false);
  const createSectionIds = [
    "create-section-1",
    "create-section-2",
    "create-section-3",
    "create-section-4",
    "create-section-5",
    "create-section-6",
    "create-section-7",
    "create-section-8"
  ] as const;
  const createSectionTitles = [
    "I. Personal Information",
    "II. Family Background",
    "III. Educational Background",
    "IV. Civil Service Eligibility",
    "V. Work Experience",
    "VI. Voluntary Work or Involvement in Civic/Non-Government/People/Voluntary Organizations",
    "VII. Learning and Development (L&D) Interventions/Training Programs Attended",
    "VIII. Other Information"
  ] as const;
  const [createSectionIndex, setCreateSectionIndex] = useState(0);
  const [dualCitizenshipType, setDualCitizenshipType] = useState<"" | "By Birth" | "By Naturalization">("");
  const [editDualCitizenshipType, setEditDualCitizenshipType] = useState<"" | "By Birth" | "By Naturalization">("");
  const [childrenEntries, setChildrenEntries] = useState<ChildEntry[]>([{ fullName: "", dateOfBirth: "" }]);
  const [educationEntries, setEducationEntries] = useState<EducationEntry[]>(buildDefaultEducationEntries());
  const [civilServiceEntries, setCivilServiceEntries] = useState<CivilServiceEntry[]>([createCivilServiceEntry()]);
  const [workExperienceEntries, setWorkExperienceEntries] = useState<WorkExperienceEntry[]>([createWorkExperienceEntry()]);
  const [voluntaryWorkEntries, setVoluntaryWorkEntries] = useState<VoluntaryWorkEntry[]>([createVoluntaryWorkEntry()]);
  const [trainingEntries, setTrainingEntries] = useState<TrainingEntry[]>([createTrainingEntry()]);
  const [otherInfoEntries, setOtherInfoEntries] = useState<OtherInfoEntry[]>([createOtherInfoEntry()]);
  // Edit-specific section state
  const [editSectionIndex, setEditSectionIndex] = useState(0);
  const [editNameParts, setEditNameParts] = useState<NameParts>({ firstName: "", middleName: "", lastName: "", extensionName: "" });
  const [editChildrenEntries, setEditChildrenEntries] = useState<ChildEntry[]>([{ fullName: "", dateOfBirth: "" }]);
  const [editEducationEntries, setEditEducationEntries] = useState<EducationEntry[]>(buildDefaultEducationEntries());
  const [editCivilServiceEntries, setEditCivilServiceEntries] = useState<CivilServiceEntry[]>([createCivilServiceEntry()]);
  const [editWorkExperienceEntries, setEditWorkExperienceEntries] = useState<WorkExperienceEntry[]>([createWorkExperienceEntry()]);
  const [editVoluntaryWorkEntries, setEditVoluntaryWorkEntries] = useState<VoluntaryWorkEntry[]>([createVoluntaryWorkEntry()]);
  const [editTrainingEntries, setEditTrainingEntries] = useState<TrainingEntry[]>([createTrainingEntry()]);
  const [editOtherInfoEntries, setEditOtherInfoEntries] = useState<OtherInfoEntry[]>([createOtherInfoEntry()]);
  const [editDocuments, setEditDocuments] = useState<{ resume: File | null; transcript: File | null; certificates: File[] }>(
    { resume: null, transcript: null, certificates: [] }
  );

  const { data: applicants = [] } = useQuery({
    queryKey: ["applicants"],
    queryFn: fetchApplicants
  });

  const { data: applications = [] } = useQuery({
    queryKey: ["applications"],
    queryFn: fetchApplications
  });

  const { data: jobVacancies = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: fetchJobs
  });

  const { data: applicantDocuments = [] } = useQuery({
    queryKey: ["applicant-documents", viewingApplicantId],
    queryFn: () => (viewingApplicantId ? fetchApplicantDocuments(viewingApplicantId) : Promise.resolve([])),
    enabled: !!viewingApplicantId
  });

  const { data: editingApplicantDocuments = [] } = useQuery({
    queryKey: ["applicant-documents-edit", editingApplicantId],
    queryFn: () => (editingApplicantId ? fetchApplicantDocuments(editingApplicantId) : Promise.resolve([])),
    enabled: !!editingApplicantId
  });

  const handleExportApplicant = async (format: "pdf" | "docx") => {
    if (!viewingApplicantId) return;

    const applicant = applicants.find((entry) => entry.id === viewingApplicantId);
    if (!applicant) {
      toast({ title: "Export failed", description: "Applicant not found.", variant: "destructive" });
      return;
    }

    setIsExportingApplicant(true);
    try {
      const relatedApplications = applications.filter((a) => a.applicantId === applicant.id);
      const fileNameBase =
        (applicant.fullName || "applicant")
          .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
          .replace(/\s+/g, "_")
          .trim() || "applicant";

      // ── parse stored strings ──────────────────────────────────────────────
      const educationRows = parseEducationalBackground(applicant.educationalBackground || "").filter((r) =>
        hasMeaningfulValue(r.level) || hasMeaningfulValue(r.schoolName) || hasMeaningfulValue(r.degreeCourse) ||
        hasMeaningfulValue(r.attendanceFrom) || hasMeaningfulValue(r.attendanceTo) ||
        hasMeaningfulValue(r.highestLevelUnitsEarned) || hasMeaningfulValue(r.yearGraduated) || hasMeaningfulValue(r.scholarshipHonors)
      );
      const civilServiceRows = parseCivilServiceEligibility(applicant.civilServiceEligibility || "").filter((r) =>
        hasMeaningfulValue(r.eligibility) || hasMeaningfulValue(r.rating) || hasMeaningfulValue(r.examDate) ||
        hasMeaningfulValue(r.examPlace) || hasMeaningfulValue(r.licenseNumber) || hasMeaningfulValue(r.licenseValidUntil)
      );
      const workRows = parseWorkExperience(applicant.workExperience || "").filter((r) =>
        hasMeaningfulValue(r.positionTitle) || hasMeaningfulValue(r.departmentAgencyOfficeCompany) ||
        hasMeaningfulValue(r.dateFrom) || hasMeaningfulValue(r.dateTo) ||
        hasMeaningfulValue(r.statusOfAppointment) || hasMeaningfulValue(r.isGovtService)
      );
      const voluntaryRows = parseVoluntaryWork(applicant.voluntaryWork || "").filter((r) =>
        hasMeaningfulValue(r.organizationNameAddress) || hasMeaningfulValue(r.dateFrom) ||
        hasMeaningfulValue(r.dateTo) || hasMeaningfulValue(r.numberOfHours) || hasMeaningfulValue(r.positionNatureOfWork)
      );
      const trainingRows = parseTrainings(applicant.trainings || "").filter((r) =>
        hasMeaningfulValue(r.title) || hasMeaningfulValue(r.dateFrom) || hasMeaningfulValue(r.dateTo) ||
        hasMeaningfulValue(r.numberOfHours) || hasMeaningfulValue(r.typeOfLd) || hasMeaningfulValue(r.conductedSponsoredBy)
      );
      const otherInfoRows = parseOtherInfo(applicant.otherInfo || "").filter((r) =>
        hasMeaningfulValue(r.specialSkillsHobbies) || hasMeaningfulValue(r.nonAcademicDistinctionsRecognition) ||
        hasMeaningfulValue(r.membershipsAssociationOrganization)
      );
      const children = parseChildrenInfo(applicant.childrenInfo || "").filter(
        (c) => hasMeaningfulValue(c.fullName) || hasMeaningfulValue(c.dateOfBirth)
      );

      // ── name parts ───────────────────────────────────────────────────────
      const np = splitFullName(applicant.fullName || "");

      // ════════════════════════════════════════════════════════════════════
      //  PDF — CS Form No. 212 (Revised 2017) faithful layout
      // ════════════════════════════════════════════════════════════════════
      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

        const PW = pdf.internal.pageSize.getWidth();   // 210
        const PH = pdf.internal.pageSize.getHeight();  // 297
        const ML = 8;
        const CW = PW - ML * 2;                        // 194

        // ── palette (matches actual CSC PDS grayscale print style) ────────
        // Section header bars: dark charcoal gray, white text
        const SEC_BG:    [number,number,number] = [64,  64,  64];
        // Sub-section bars (Spouse / Father / Mother): medium gray
        const SUB_BG:    [number,number,number] = [160, 160, 160];
        // Column header cells: light gray
        const COL_BG:    [number,number,number] = [220, 220, 220];
        // Warning / instruction strips: very light gray
        const STRIP_BG:  [number,number,number] = [242, 242, 242];
        const WHITE:     [number,number,number] = [255, 255, 255];
        const BLACK:     [number,number,number] = [0,   0,   0];
        const DGRAY:     [number,number,number] = [80,  80,  80];
        const LGRAY:     [number,number,number] = [100, 100, 100];

        let y = ML;

        // ── low-level helpers ─────────────────────────────────────────────

        const newPage = () => { pdf.addPage(); y = ML; };

        // guard() is used ONLY for whole-section pre-flight checks.
        // Never call it inside a row loop — that causes mid-table page breaks.
        const guard = (need: number) => { if (y + need > PH - ML) newPage(); };

        const fillR = (x: number, ry: number, w: number, h: number, c: [number,number,number]) => {
          pdf.setFillColor(...c);
          pdf.rect(x, ry, w, h, "F");
        };

        const borderR = (x: number, ry: number, w: number, h: number, lw = 0.15) => {
          pdf.setDrawColor(...DGRAY);
          pdf.setLineWidth(lw);
          pdf.rect(x, ry, w, h, "S");
        };

        const txt = (
          text: string,
          x: number, ry: number, w: number, h: number,
          sz = 7, bold = false, color: [number,number,number] = BLACK,
          align: "left"|"center"|"right" = "left", pad = 0.9
        ) => {
          pdf.setFontSize(sz);
          pdf.setFont("helvetica", bold ? "bold" : "normal");
          pdf.setTextColor(...color);
          const lh = sz * 0.352;
          const cy = ry + h / 2 + lh * 0.35;
          const maxW = w - pad * 2;
          const tx = align === "center" ? x + w / 2 : align === "right" ? x + w - pad : x + pad;
          const lines = pdf.splitTextToSize(String(text ?? ""), maxW);
          pdf.text(lines[0] ?? "", tx, cy, { align, maxWidth: maxW });
        };

        const smallTxt = (text: string, x: number, ry: number, w: number, pad = 0.9) => {
          pdf.setFontSize(5.2);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(...LGRAY);
          pdf.text(String(text), x + pad, ry + 1.8, { maxWidth: w - pad * 2 });
        };

        /** label+value cell: gray label caption top-left, value text in lower 60% */
        const lvc = (label: string, value: string, x: number, ry: number, w: number, h: number, vsz = 7.5) => {
          fillR(x, ry, w, h, WHITE);
          borderR(x, ry, w, h);
          smallTxt(label, x, ry, w);
          txt(value || "", x, ry + h * 0.38, w, h * 0.62, vsz, false, BLACK, "left");
        };

        /** column header cell — light gray fill, dark text, centered */
        const hdr = (label: string, x: number, ry: number, w: number, h: number) => {
          fillR(x, ry, w, h, COL_BG);
          borderR(x, ry, w, h);
          pdf.setFontSize(5.5); pdf.setFont("helvetica","bold"); pdf.setTextColor(...BLACK);
          const lines = pdf.splitTextToSize(label, w - 1.6);
          const lineH = 5.5 * 0.352;
          const totalH = lines.length * lineH * 1.3;
          const startY = ry + (h - totalH) / 2 + lineH;
          lines.forEach((l: string, i: number) => {
            pdf.text(l, x + w / 2, startY + i * lineH * 1.3, { align: "center", maxWidth: w - 1.6 });
          });
        };

        /** value-only cell */
        const vc = (value: string, x: number, ry: number, w: number, h: number, sz = 7) => {
          fillR(x, ry, w, h, WHITE);
          borderR(x, ry, w, h);
          txt(value || "", x, ry, w, h, sz);
        };

        /** section header bar — dark gray fill, white bold text */
        const secHdr = (num: string, title: string): number => {
          const h = 5.5;
          // NOTE: do NOT call guard() here — callers must guard the full
          // section block height BEFORE calling secHdr so the header and
          // its table always land on the same page.
          fillR(ML, y, CW, h, SEC_BG);
          borderR(ML, y, CW, h, 0.2);
          txt(`${num}  ${title.toUpperCase()}`, ML, y, CW, h, 7, true, WHITE, "left");
          y += h;
          return y;
        };

        /** sub-bar (medium gray) — Spouse / Father / Mother labels */
        const subBar = (title: string): number => {
          const h = 4.5;
          fillR(ML, y, CW, h, SUB_BG);
          borderR(ML, y, CW, h, 0.15);
          txt(title, ML, y, CW, h, 6, true, WHITE);
          y += h;
          return y;
        };

        /** draw a complete table row — NO guard() inside; caller pre-flights the block */
        const tblRow = (
          cols: { w: number; val: string }[],
          rh: number,
          isHdr = false
        ) => {
          let rx = ML;
          for (const c of cols) {
            if (isHdr) hdr(c.val, rx, y, c.w, rh);
            else        vc(c.val, rx, y, c.w, rh);
            rx += c.w;
          }
          y += rh;
        };

        // ══════════════════════════════════════════════════════════════════
        //  PAGE 1
        // ══════════════════════════════════════════════════════════════════

        // ── top meta bar ─────────────────────────────────────────────────
        const metaH = 8;
        const csFormW = 38;
        fillR(ML, y, CW - csFormW, metaH, STRIP_BG);
        borderR(ML, y, CW - csFormW, metaH);
        txt("CS Form No. 212", ML, y, CW - csFormW, metaH / 2, 6.5, true, BLACK, "center");
        txt("Revised 2017", ML, y + metaH / 2, CW - csFormW, metaH / 2, 6, false, DGRAY, "center");
        vc("Page 1 of 4", ML + CW - csFormW, y, csFormW, metaH, 6);
        y += metaH;

        // ── title ─────────────────────────────────────────────────────────
        fillR(ML, y, CW, 7, SEC_BG);
        borderR(ML, y, CW, 7, 0.2);
        txt("PERSONAL DATA SHEET", ML, y, CW, 7, 11, true, WHITE, "center");
        y += 7;

        // ── warning strip ────────────────────────────────────────────────
        fillR(ML, y, CW, 4.5, STRIP_BG);
        borderR(ML, y, CW, 4.5);
        pdf.setFontSize(5); pdf.setFont("helvetica","bold"); pdf.setTextColor(140,0,0);
        pdf.text(
          "WARNING: Any misrepresentation made in the Personal Data Sheet and the Work Experience Sheet shall cause the filing of administrative/criminal case/s against the person concerned.",
          ML + 0.8, y + 2.8, { maxWidth: CW - 1.6 }
        );
        y += 4.5;

        // ── instruction strip ────────────────────────────────────────────
        fillR(ML, y, CW, 3.8, WHITE);
        borderR(ML, y, CW, 3.8);
        pdf.setFontSize(5.2); pdf.setFont("helvetica","italic"); pdf.setTextColor(...DGRAY);
        pdf.text(
          "Print legibly. Tick appropriate boxes ( ✓ ) and use separate sheet if necessary. Indicate N/A if not applicable. DO NOT ABBREVIATE.",
          ML + 0.8, y + 2.5, { maxWidth: CW - 1.6 }
        );
        y += 3.8;

        // ══ I. Personal Information ══════════════════════════════════════
        secHdr("I.", "Personal Information");

        // row: Surname | First Name | Middle Name | Ext.
        const nH = 8;
        const nW = [CW*0.27, CW*0.27, CW*0.27, CW - CW*0.27*3];
        lvc("1.  SURNAME", np.lastName, ML, y, nW[0], nH);
        lvc("FIRST NAME", np.firstName, ML+nW[0], y, nW[1], nH);
        lvc("MIDDLE NAME", np.middleName, ML+nW[0]+nW[1], y, nW[2], nH);
        lvc("NAME EXTENSION (JR, SR)", np.extensionName, ML+nW[0]+nW[1]+nW[2], y, nW[3], nH);
        y += nH;

        // row: Date of Birth | Place of Birth (wider)
        const r2H = 8;
        lvc("2.  DATE OF BIRTH (mm/dd/yyyy)", applicant.dateOfBirth || "", ML, y, CW*0.3, r2H);
        lvc("3.  PLACE OF BIRTH", applicant.placeOfBirth || "", ML+CW*0.3, y, CW*0.7, r2H);
        y += r2H;

        // row: Sex | Civil Status | Height | Weight | Blood Type
        const r3H = 9;
        const sexW = CW*0.14, csW2 = CW*0.22, htW = CW*0.14, wtW = CW*0.14, btW = CW - sexW - csW2 - htW - wtW;

        // ── Normalize helper: pick the first matching keyword from a raw value ──
        // Handles cases where the DB stores "Male & Female" or "Single & Married"
        // instead of a single clean value. Returns the first recognized token.
        const pickFirst = (raw: string, options: string[]): string => {
          if (!raw) return "";
          const r = raw.trim();
          // exact match first
          const exact = options.find(o => o.toLowerCase() === r.toLowerCase());
          if (exact) return exact;
          // otherwise return the first option that appears in the raw string
          return options.find(o => r.toLowerCase().includes(o.toLowerCase())) || r;
        };

        // Normalize sex — "Male & Female" → "Male" (first match wins)
        const sexNorm = pickFirst(applicant.sex || "", ["Male", "Female"]);

        // Normalize civil status — "Single & Married & Widowed" → "Single"
        const csOptions = ["Single","Married","Widowed","Separated","Other"];
        const csNorm = pickFirst(applicant.civilStatus || "", csOptions);

        // Normalize citizenship — "Filipino & Dual Citizenship" → "Filipino"
        const citizNorm = pickFirst(applicant.citizenship || "", ["Filipino","Dual Citizenship"]);

        // Sex (single value)
        fillR(ML, y, sexW, r3H, WHITE); borderR(ML, y, sexW, r3H);
        smallTxt("4.  SEX", ML, y, sexW);
        txt(sexNorm || "N/A", ML + 2, y + r3H*0.38, sexW - 4, r3H*0.62, 7);

        // Civil Status (single value)
        fillR(ML+sexW, y, csW2, r3H, WHITE); borderR(ML+sexW, y, csW2, r3H);
        smallTxt("5.  CIVIL STATUS", ML+sexW, y, csW2);
        txt(csNorm || "N/A", ML+sexW + 2, y + r3H*0.38, csW2 - 4, r3H*0.62, 7);

        lvc("6.  HEIGHT (m)",  applicant.height  || "", ML+sexW+csW2,          y, htW, r3H);
        lvc("7.  WEIGHT (kg)", applicant.weight  || "", ML+sexW+csW2+htW,      y, wtW, r3H);
        lvc("8.  BLOOD TYPE",  applicant.bloodType||"", ML+sexW+csW2+htW+wtW, y, btW, r3H);
        y += r3H;

        // row: Citizenship | Tel | Mobile
        const r4H = 9;
        fillR(ML, y, CW*0.5, r4H, WHITE); borderR(ML, y, CW*0.5, r4H);
        smallTxt("9.  CITIZENSHIP", ML, y, CW*0.5);
        // Render single-value citizenship, append details for Dual Citizenship
        const citizDisplay = citizNorm + (citizNorm === "Dual Citizenship" && applicant.citizenshipDetails ? " — " + applicant.citizenshipDetails : "");
        txt(citizDisplay || "N/A", ML + 2, y + r4H*0.38, CW*0.5 - 4, r4H*0.62, 7);
        lvc("10.  TELEPHONE NO.", applicant.telephoneNumber||"", ML+CW*0.5,    y, CW*0.25, r4H);
        lvc("11.  MOBILE NO.",    applicant.contactNumber  ||"", ML+CW*0.75,   y, CW*0.25, r4H);
        y += r4H;

        // Residential address
        lvc("12.  RESIDENTIAL ADDRESS (House/Block/Lot No., Street, Subdivision/Village, Barangay, City/Municipality, Province, Zip Code)",
            applicant.address||"", ML, y, CW, 7.5);
        y += 7.5;

        // Permanent address
        lvc("13.  PERMANENT ADDRESS (House/Block/Lot No., Street, Subdivision/Village, Barangay, City/Municipality, Province, Zip Code)",
            applicant.permanentAddress||applicant.address||"", ML, y, CW, 7.5);
        y += 7.5;

        // Email
        lvc("14.  EMAIL ADDRESS (if any)", applicant.email||"", ML, y, CW, 6.5);
        y += 6.5;

        // IDs row 1
        const idH = 6.5, idW = CW/4;
        lvc("15.  GSIS ID NO.",      applicant.gsisIdNo   ||"", ML,          y, idW, idH);
        lvc("16.  PAG-IBIG ID NO.",  applicant.pagibigIdNo||"", ML+idW,      y, idW, idH);
        lvc("17.  PHILHEALTH NO.",   applicant.philhealthNo||"",ML+idW*2,    y, idW, idH);
        lvc("18.  SSS NO.",          applicant.sssNo      ||"", ML+idW*3,    y, idW, idH);
        y += idH;

        // IDs row 2
        const id2W = CW/3;
        lvc("19.  TIN NO.",             applicant.tinNo         ||"", ML,        y, id2W, idH);
        lvc("20.  AGENCY EMPLOYEE NO.", applicant.agencyEmployeeNo||"",ML+id2W,  y, id2W, idH);
        lvc("21.  PHILSYS NO. (PSN)",   applicant.philsysNo     ||"", ML+id2W*2, y, id2W, idH);
        y += idH;

        // ══ II. Family Background ════════════════════════════════════════
        // Pre-flight: section header (5.5) + subBar (4.5)*3 + rows (7)*5 +
        //             children header (5.5) + children rows (5.5)*5 ≈ 85mm
        // We keep this section together by guarding the full estimated block.
        const fH = 7;
        const minCcount = Math.max(children.length, 5);
        const familyBlockH = 5.5 + (4.5 + fH) + (4.5 + fH) + (4.5 + fH * 2) +
                             (4.5 + 5.5 + minCcount * 5.5);
        guard(familyBlockH);
        secHdr("II.", "Family Background");

        // Spouse
        subBar("SPOUSE");
        lvc("22.  SURNAME",      applicant.spouseSurname      ||"", ML,           y, CW*0.26, fH);
        lvc("FIRST NAME",        applicant.spouseFirstName    ||"", ML+CW*0.26,   y, CW*0.26, fH);
        lvc("MIDDLE NAME",       applicant.spouseMiddleName   ||"", ML+CW*0.52,   y, CW*0.28, fH);
        lvc("NAME EXT.",         applicant.spouseNameExtension||"", ML+CW*0.80,   y, CW*0.20, fH);
        y += fH;
        lvc("OCCUPATION",                    applicant.spouseOccupation         ||"", ML,           y, CW*0.3,  fH);
        lvc("EMPLOYER/BUSINESS NAME",        applicant.spouseEmployerBusinessName||"", ML+CW*0.3,    y, CW*0.45, fH);
        lvc("TELEPHONE NO.",                 applicant.spouseTelephoneNo        ||"", ML+CW*0.75,   y, CW*0.25, fH);
        y += fH;
        lvc("BUSINESS ADDRESS", applicant.spouseBusinessAddress||"", ML, y, CW, fH);
        y += fH;

        // Father
        subBar("FATHER");
        lvc("23.  SURNAME",  applicant.fatherSurname      ||"", ML,           y, CW*0.26, fH);
        lvc("FIRST NAME",    applicant.fatherFirstName    ||"", ML+CW*0.26,   y, CW*0.26, fH);
        lvc("MIDDLE NAME",   applicant.fatherMiddleName   ||"", ML+CW*0.52,   y, CW*0.28, fH);
        lvc("NAME EXT.",     applicant.fatherNameExtension||"", ML+CW*0.80,   y, CW*0.20, fH);
        y += fH;

        // Mother
        subBar("MOTHER'S MAIDEN NAME");
        lvc("24.  SURNAME",  applicant.motherSurname  ||"", ML,           y, CW*0.26, fH);
        lvc("FIRST NAME",    applicant.motherFirstName||"", ML+CW*0.26,   y, CW*0.26, fH);
        lvc("MIDDLE NAME",   applicant.motherMiddleName||"",ML+CW*0.52,   y, CW*0.48, fH);
        y += fH;

        // Children — pre-flight the sub-table as a unit
        const cNameW = CW*0.56, cDobW = CW - cNameW, cRowH = 5.5;
        const childrenBlockH = 4.5 + cRowH + minCcount * cRowH;
        guard(childrenBlockH);
        subBar("25.  NAME OF CHILDREN (Write full name and list all)");
        tblRow([{w:cNameW,val:"FULL NAME OF CHILDREN (Family Name, First Name, Middle Name)"},{w:cDobW,val:"DATE OF BIRTH (mm/dd/yyyy)"}], cRowH, true);
        const minC = minCcount;
        for (let i = 0; i < minC; i++) {
          const c = children[i] || {fullName:"",dateOfBirth:""};
          tblRow([{w:cNameW,val:c.fullName||""},{w:cDobW,val:c.dateOfBirth||""}], cRowH);
        }

        // ══ III. Educational Background ══════════════════════════════════
        // 5 fixed levels × 6mm rows + 12mm header + 5.5mm section bar = ~47mm
        const eHdrH = 12;
        const eduBlockH = 5.5 + eHdrH + 5 * 6;
        guard(eduBlockH);
        secHdr("III.", "Educational Background");

        const eW = [CW*0.12, CW*0.22, CW*0.17, CW*0.08, CW*0.08, CW*0.12, CW*0.1, CW-(CW*0.12+CW*0.22+CW*0.17+CW*0.08*2+CW*0.12+CW*0.1)];
        const eHdrs = ["LEVEL","NAME OF SCHOOL\n(Write in full)","BASIC EDUCATION/\nDEGREE/COURSE\n(Write in full)","FROM","TO","HIGHEST LEVEL/\nUNITS EARNED\n(if not graduated)","YEAR\nGRADUATED","SCHOLARSHIP/\nACADEMIC\nHONORS\nRECEIVED"];
        let ex = ML;
        for (let i=0;i<eHdrs.length;i++) { hdr(eHdrs[i], ex, y, eW[i], eHdrH); ex+=eW[i]; }
        y += eHdrH;

        const eLevels = ["Elementary","Secondary","Vocational / Trade Course","College","Graduate Studies"];
        for (const lvl of eLevels) {
          const match = educationRows.find(r => r.level.toLowerCase().startsWith(lvl.toLowerCase().split(" ")[0]));
          const r = match || {level:lvl,schoolName:"",degreeCourse:"",attendanceFrom:"",attendanceTo:"",highestLevelUnitsEarned:"",yearGraduated:"",scholarshipHonors:""};
          const vals = [r.level,r.schoolName,r.degreeCourse,r.attendanceFrom,r.attendanceTo,r.highestLevelUnitsEarned,r.yearGraduated,r.scholarshipHonors];
          let ex2 = ML;
          for (let i=0;i<eW.length;i++) { vc(vals[i]||"", ex2, y, eW[i], 6); ex2+=eW[i]; }
          y += 6;
        }

        // ══════════════════════════════════════════════════════════════════
        //  PAGE 2
        // ══════════════════════════════════════════════════════════════════
        newPage();
        fillR(ML, y, CW, 5, SEC_BG);
        borderR(ML, y, CW, 5, 0.2);
        txt("PERSONAL DATA SHEET  (Continuation — Page 2)", ML, y, CW, 5, 8, true, WHITE, "center");
        y += 5;

        // ══ IV. Civil Service Eligibility ════════════════════════════════
        const csW3 = [CW*0.30, CW*0.10, CW*0.13, CW*0.22, CW*0.13, CW-(CW*0.30+CW*0.10+CW*0.13+CW*0.22+CW*0.13)];
        const csHdrs = [
          "CAREER SERVICE/ RA 1080 (BOARD/BAR) UNDER SPECIAL LAWS/CES/CSEE BARED EXAMINATIONS/DRIVER'S LICENSE",
          "RATING\n(If Applicable)",
          "DATE OF\nEXAMINATION/\nCONFERMENT",
          "PLACE OF\nEXAMINATION/\nCONFERMENT",
          "LICENSE\n(if Applicable)\nNUMBER",
          "DATE OF\nVALIDITY"
        ];
        const csHdrH = 11;
        const minCS = Math.max(civilServiceRows.length, 4);
        // Pre-flight the WHOLE block so header + rows always land together
        guard(5.5 + csHdrH + minCS * 6);
        secHdr("IV.", "Civil Service Eligibility");
        let csx = ML;
        for (let i=0;i<csHdrs.length;i++) { hdr(csHdrs[i], csx, y, csW3[i], csHdrH); csx+=csW3[i]; }
        y += csHdrH;
        for (let i=0;i<minCS;i++) {
          const r = civilServiceRows[i] || {eligibility:"",rating:"",examDate:"",examPlace:"",licenseNumber:"",licenseValidUntil:""};
          const vals = [r.eligibility,r.rating,r.examDate,r.examPlace,r.licenseNumber,r.licenseValidUntil];
          let cx2=ML;
          for (let j=0;j<csW3.length;j++) { vc(vals[j]||"",cx2,y,csW3[j],6); cx2+=csW3[j]; }
          y+=6;
        }

        // ══ V. Work Experience ═══════════════════════════════════════════
        const weW = [CW*0.10, CW*0.10, CW*0.22, CW*0.28, CW*0.10, CW*0.12, CW-(CW*0.10*2+CW*0.22+CW*0.28+CW*0.10+CW*0.12)];
        const weHdrs = ["INCLUSIVE\nDATES FROM","INCLUSIVE\nDATES TO","POSITION TITLE\n(Write in full/\nDo not abbreviate)","DEPARTMENT/AGENCY/OFFICE/\nCOMPANY (Write in full/\nDo not abbreviate)","MONTHLY\nSALARY","STATUS OF\nAPPOINTMENT","GOV'T\nSERVICE\n(Y/N)"];
        const weHdrH = 12;
        const minWe = Math.max(workRows.length, 7);
        // Pre-flight the WHOLE block so header + rows always land together
        guard(5.5 + weHdrH + minWe * 6);
        secHdr("V.", "Work Experience");
        pdf.setFontSize(5); pdf.setFont("helvetica","italic"); pdf.setTextColor(...DGRAY);
        pdf.text("(Include private employment. Start from your recent work) Description of duties should be indicated in the attached Work Experience Sheet.",
          ML+0.8, y-0.5, {maxWidth:CW-1.6});
        let wex = ML;
        for (let i=0;i<weHdrs.length;i++) { hdr(weHdrs[i], wex, y, weW[i], weHdrH); wex+=weW[i]; }
        y += weHdrH;
        for (let i=0;i<minWe;i++) {
          const r = workRows[i] || {dateFrom:"",dateTo:"",positionTitle:"",departmentAgencyOfficeCompany:"",statusOfAppointment:"",isGovtService:"" as ""};
          const govtVal = r.isGovtService === "Y" ? "Y" : r.isGovtService === "N" ? "N" : "";
          const vals = [r.dateFrom,r.dateTo,r.positionTitle,r.departmentAgencyOfficeCompany,"",r.statusOfAppointment,govtVal];
          let wx2=ML;
          for (let j=0;j<weW.length;j++) { vc(vals[j]||"",wx2,y,weW[j],6); wx2+=weW[j]; }
          y+=6;
        }

        // ══════════════════════════════════════════════════════════════════
        //  PAGE 3
        // ══════════════════════════════════════════════════════════════════
        newPage();
        fillR(ML, y, CW, 5, SEC_BG);
        borderR(ML, y, CW, 5, 0.2);
        txt("PERSONAL DATA SHEET  (Continuation — Page 3)", ML, y, CW, 5, 8, true, WHITE, "center");
        y += 5;

        // ══ VI. Voluntary Work ═══════════════════════════════════════════
        const vwW = [CW*0.38, CW*0.12, CW*0.12, CW*0.10, CW-(CW*0.38+CW*0.12*2+CW*0.10)];
        const vwHdrs = ["NAME & ADDRESS OF ORGANIZATION\n(Write in full)","INCLUSIVE\nDATES FROM","INCLUSIVE\nDATES TO","NUMBER\nOF HOURS","POSITION/\nNATURE OF WORK"];
        const vwHdrH = 9;
        const minVw = Math.max(voluntaryRows.length, 4);
        // Pre-flight the whole block
        guard(5.5 + vwHdrH + minVw * 6);
        secHdr("VI.", "Voluntary Work or Involvement in Civic / Non-Government / People / Voluntary Organization/s");
        let vx = ML;
        for (let i=0;i<vwHdrs.length;i++) { hdr(vwHdrs[i],vx,y,vwW[i],vwHdrH); vx+=vwW[i]; }
        y += vwHdrH;
        for (let i=0;i<minVw;i++) {
          const r = voluntaryRows[i] || {organizationNameAddress:"",dateFrom:"",dateTo:"",numberOfHours:"",positionNatureOfWork:""};
          const vals = [r.organizationNameAddress,r.dateFrom,r.dateTo,r.numberOfHours,r.positionNatureOfWork];
          let vx2=ML;
          for (let j=0;j<vwW.length;j++) { vc(vals[j]||"",vx2,y,vwW[j],6); vx2+=vwW[j]; }
          y+=6;
        }

        // ══ VII. L&D / Training ══════════════════════════════════════════
        const ldW = [CW*0.32, CW*0.10, CW*0.10, CW*0.09, CW*0.14, CW-(CW*0.32+CW*0.10*2+CW*0.09+CW*0.14)];
        const ldHdrs = ["TITLE OF LEARNING AND DEVELOPMENT\nINTERVENTION/TRAINING PROGRAM","INCLUSIVE\nDATES\nFROM","INCLUSIVE\nDATES\nTO","NUMBER\nOF\nHOURS","TYPE OF LD\n(Managerial/\nSupervisory/\nTechnical/etc)","CONDUCTED/\nSPONSORED\nBY"];
        const ldHdrH = 12;
        const minLd = Math.max(trainingRows.length, 5);
        // Pre-flight the whole block
        guard(5.5 + ldHdrH + minLd * 6);
        secHdr("VII.", "Learning and Development (L&D) Interventions/Training Programs Attended");
        pdf.setFontSize(5); pdf.setFont("helvetica","italic"); pdf.setTextColor(...DGRAY);
        pdf.text("(Start from the most recent L&D/Training Program and include only the relevant L&D/Training taken for the last five (5) years for Division Chief/Executive/Managerial positions)",
          ML+0.8, y-0.5, {maxWidth:CW-1.6});
        let ldx = ML;
        for (let i=0;i<ldHdrs.length;i++) { hdr(ldHdrs[i],ldx,y,ldW[i],ldHdrH); ldx+=ldW[i]; }
        y += ldHdrH;
        for (let i=0;i<minLd;i++) {
          const r = trainingRows[i] || {title:"",dateFrom:"",dateTo:"",numberOfHours:"",typeOfLd:"",conductedSponsoredBy:""};
          const vals = [r.title,r.dateFrom,r.dateTo,r.numberOfHours,r.typeOfLd,r.conductedSponsoredBy];
          let lx2=ML;
          for (let j=0;j<ldW.length;j++) { vc(vals[j]||"",lx2,y,ldW[j],6); lx2+=ldW[j]; }
          y+=6;
        }

        // ══ VIII. Other Information ══════════════════════════════════════
        const oiW = [CW/3, CW/3, CW - CW/3*2];
        const oiHdrs = ["34.  SPECIAL SKILLS and HOBBIES","35.  NON-ACADEMIC DISTINCTIONS/\nRECOGNITION (Write in full)","36.  MEMBERSHIP IN ASSOCIATION/\nORGANIZATION (Write in full)"];
        const oiHdrH = 8;
        const minOi = Math.max(otherInfoRows.length, 4);
        // Pre-flight the whole block
        guard(5.5 + oiHdrH + minOi * 6);
        secHdr("VIII.", "Other Information");
        let oix = ML;
        for (let i=0;i<oiHdrs.length;i++) { hdr(oiHdrs[i],oix,y,oiW[i],oiHdrH); oix+=oiW[i]; }
        y += oiHdrH;
        for (let i=0;i<minOi;i++) {
          const r = otherInfoRows[i] || {specialSkillsHobbies:"",nonAcademicDistinctionsRecognition:"",membershipsAssociationOrganization:""};
          const vals = [r.specialSkillsHobbies,r.nonAcademicDistinctionsRecognition,r.membershipsAssociationOrganization];
          let ox2=ML;
          for (let j=0;j<oiW.length;j++) { vc(vals[j]||"",ox2,y,oiW[j],6); ox2+=oiW[j]; }
          y+=6;
        }

        // ══ 37. References ════════════════════════════════════════════════
        const refW = [CW*0.40, CW*0.35, CW - CW*0.40 - CW*0.35];
        const refLines = (applicant.referencesInfo||"").split("\n").filter(Boolean);
        const minRef = Math.max(refLines.length, 3);
        // Pre-flight the whole block
        guard(5.5 + 6 + minRef * 6);
        secHdr("37.", "References (Person not related by consanguinity or affinity to applicant/appointee)");
        tblRow([{w:refW[0],val:"NAME"},{w:refW[1],val:"ADDRESS"},{w:refW[2],val:"TEL. NO."}], 6, true);
        for (let i=0;i<minRef;i++) {
          const parts = (refLines[i]||"").split("|");
          tblRow([{w:refW[0],val:parts[0]||""},{w:refW[1],val:parts[1]||""},{w:refW[2],val:parts[2]||""}], 6);
        }

        // ══════════════════════════════════════════════════════════════════
        //  PAGE 4  — Declaration & Signature
        // ══════════════════════════════════════════════════════════════════
        newPage();
        fillR(ML, y, CW, 5, SEC_BG);
        borderR(ML, y, CW, 5, 0.2);
        txt("PERSONAL DATA SHEET  (Continuation — Page 4)", ML, y, CW, 5, 8, true, WHITE, "center");
        y += 5 + 3;

        // Declaration
        const declH = 22;
        fillR(ML, y, CW, declH, WHITE); borderR(ML, y, CW, declH, 0.3);
        pdf.setFontSize(6.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(0,0,0);
        const decl =
          "I declare under oath that I have personally accomplished this Personal Data Sheet which is a true, " +
          "correct and complete statement pursuant to the provisions of pertinent laws, rules and regulations of " +
          "the Republic of the Philippines. I authorize the agency head/authorized representative to verify/validate " +
          "the contents stated herein. I agree that any misrepresentation made in this document and its attachments " +
          "shall cause the filing of administrative/criminal case/s against me.";
        const declLines = pdf.splitTextToSize(decl, CW - 4);
        pdf.text(declLines, ML + 2, y + 4);
        y += declH + 4;

        // Signature block
        const sigH = 22;
        const sigW = CW / 2;

        // Left: Applicant signature
        fillR(ML, y, sigW, sigH, WHITE); borderR(ML, y, sigW, sigH, 0.3);
        txt("Signature", ML, y + sigH - 7, sigW, 5, 6.5, false, BLACK, "center");
        pdf.setDrawColor(...DGRAY); pdf.setLineWidth(0.3);
        pdf.line(ML+6, y + sigH - 8, ML + sigW - 6, y + sigH - 8);
        txt("Date", ML, y + sigH - 2.5, sigW/2, 5, 6.5, false, BLACK, "center");
        pdf.line(ML + sigW/2 + 2, y + sigH - 3.5, ML + sigW - 4, y + sigH - 3.5);

        // Right: Administering officer
        fillR(ML + sigW, y, sigW, sigH, WHITE); borderR(ML + sigW, y, sigW, sigH, 0.3);
        pdf.setFontSize(6); pdf.setFont("helvetica","normal"); pdf.setTextColor(0,0,0);
        const sworn = "SUBSCRIBED AND SWORN to before me this ___ day of ______________, ______ at _________________________, Philippines.";
        const swornLines = pdf.splitTextToSize(sworn, sigW - 4);
        pdf.text(swornLines, ML + sigW + 2, y + 5);
        txt("Administering Officer", ML + sigW, y + sigH - 7, sigW, 5, 6.5, false, BLACK, "center");
        pdf.line(ML + sigW + 4, y + sigH - 8, ML + CW - 4, y + sigH - 8);
        y += sigH;

        // ── footer on every page ──────────────────────────────────────────
        // "CS Form No. 212 (Revised 2017)" is the official CSC form identifier —
        // included for HR processing compatibility. The "Generated by" tag
        // clearly identifies this system as the source, not the CSC itself.
        const pageCount = (pdf.internal as any).getNumberOfPages();
        for (let p = 1; p <= pageCount; p++) {
          pdf.setPage(p);
          pdf.setFontSize(5.5);
          pdf.setFont("helvetica","normal");
          pdf.setTextColor(100,100,100);
          pdf.text(
            `CS Form No. 212 (Revised 2017)  |  Page ${p} of ${pageCount}  |  Generated by WMSU HRMO Tracker on ${new Date().toLocaleDateString()}  |  ${applicant.fullName || ""}`,
            ML, PH - 4
          );
        }

        pdf.save(`${fileNameBase}_PDS.pdf`);

      // ════════════════════════════════════════════════════════════════════
      //  DOCX — clean structured format (unchanged)
      // ════════════════════════════════════════════════════════════════════
      } else {
        const {
          AlignmentType, Document, HeadingLevel, Packer,
          Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType
        } = await import("docx");

        const mkHeading = (title: string) =>
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 180, after: 90 },
            children: [new TextRun({ text: title, bold: true })]
          });

        const mkKV = (rows: Array<[string, string]>) =>
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: rows.map(([lbl, val]) =>
              new TableRow({ children: [
                new TableCell({ width:{size:35,type:WidthType.PERCENTAGE}, children:[new Paragraph({children:[new TextRun({text:lbl,bold:true})]})] }),
                new TableCell({ width:{size:65,type:WidthType.PERCENTAGE}, children:[new Paragraph(formatExportValue(val))] })
              ]})
            )
          });

        const mkGrid = (headers: string[], rows: string[][]) =>
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: headers.map(h =>
                new TableCell({ shading:{fill:"BEDCEB",type:ShadingType.CLEAR,color:"auto"}, children:[new Paragraph({children:[new TextRun({text:h,bold:true})]})] })
              )}),
              ...(rows.length > 0
                ? rows.map(row => new TableRow({ children: row.map(c => new TableCell({children:[new Paragraph(formatExportValue(c))]})) }))
                : [new TableRow({ children: headers.map((_,i) => new TableCell({children:[new Paragraph(i===0?"No records":"")]})) })]
              )
            ]
          });

        const applicationRows = relatedApplications.map(app => {
          const vac = jobVacancies.find(v => v.id === app.vacancyId);
          return [formatExportValue(vac?.positionTitle), formatExportValue(app.status), formatExportValue(app.dateApplied), formatExportValue(app.remarks)];
        });
        const documentRows = applicantDocuments.map(d => [formatExportValue(d.originalName), formatExportValue(d.docType)]);

        const doc = new Document({ sections: [{ children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing:{after:40}, children:[new TextRun({text:"CS Form No. 212 (Revised 2017)",size:18})] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing:{after:120}, children:[new TextRun({text:"PERSONAL DATA SHEET",bold:true,size:30})] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children:[new TextRun(`Generated: ${new Date().toLocaleString()}`)] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing:{after:180}, children:[new TextRun(`Applicant: ${applicant.fullName||"N/A"}`)] }),

          mkHeading("I. Personal Information"),
          mkKV([
            ["Surname / First / Middle / Extension", formatExportValue(applicant.fullName)],
            ["Date of Birth", formatExportValue(applicant.dateOfBirth)],
            ["Place of Birth", formatExportValue(applicant.placeOfBirth)],
            ["Sex", formatExportValue(applicant.sex)],
            ["Civil Status", formatExportValue(applicant.civilStatus)],
            ["Citizenship", formatExportValue(applicant.citizenship)],
            ["Citizenship Details", formatExportValue(applicant.citizenshipDetails)],
            ["Height / Weight / Blood Type", `${formatExportValue(applicant.height)} / ${formatExportValue(applicant.weight)} / ${formatExportValue(applicant.bloodType)}`],
            ["Address", formatExportValue(applicant.address)],
            ["Permanent Address", formatExportValue(applicant.permanentAddress)],
            ["Telephone / Mobile / Email", `${formatExportValue(applicant.telephoneNumber)} / ${formatExportValue(applicant.contactNumber)} / ${formatExportValue(applicant.email)}`],
            ["GSIS / PAG-IBIG / PHILHEALTH", `${formatExportValue(applicant.gsisIdNo)} / ${formatExportValue(applicant.pagibigIdNo)} / ${formatExportValue(applicant.philhealthNo)}`],
            ["PhilSys / SSS / TIN / Agency No.", `${formatExportValue(applicant.philsysNo)} / ${formatExportValue(applicant.sssNo)} / ${formatExportValue(applicant.tinNo)} / ${formatExportValue(applicant.agencyEmployeeNo)}`]
          ]),
          mkHeading("II. Family Background"),
          mkKV([
            ["Spouse Name", formatExportValue([applicant.spouseSurname,applicant.spouseFirstName,applicant.spouseMiddleName,applicant.spouseNameExtension].filter(Boolean).join(" "))],
            ["Spouse Occupation", formatExportValue(applicant.spouseOccupation)],
            ["Spouse Employer/Business", formatExportValue(applicant.spouseEmployerBusinessName)],
            ["Spouse Business Address", formatExportValue(applicant.spouseBusinessAddress)],
            ["Spouse Telephone", formatExportValue(applicant.spouseTelephoneNo)],
            ["Father Name", formatExportValue([applicant.fatherSurname,applicant.fatherFirstName,applicant.fatherMiddleName,applicant.fatherNameExtension].filter(Boolean).join(" "))],
            ["Mother Maiden Name", formatExportValue([applicant.motherSurname,applicant.motherFirstName,applicant.motherMiddleName].filter(Boolean).join(" "))]
          ]),
          mkHeading("III. Educational Background"),
          mkGrid(["Level","School","Degree/Course","From","To","Units Earned","Year Graduated","Honors/Scholarship"],
            educationRows.map(r=>[r.level,r.schoolName,r.degreeCourse,r.attendanceFrom,r.attendanceTo,r.highestLevelUnitsEarned,r.yearGraduated,r.scholarshipHonors].map(formatExportValue))
          ),
          mkHeading("IV. Civil Service Eligibility"),
          mkGrid(["Eligibility","Rating","Exam Date","Exam Place","License No.","Date of Validity"],
            civilServiceRows.map(r=>[r.eligibility,r.rating,r.examDate,r.examPlace,r.licenseNumber,r.licenseValidUntil].map(formatExportValue))
          ),
          mkHeading("V. Work Experience"),
          mkGrid(["From","To","Position Title","Agency/Company","Monthly Salary","Status of Appointment","Gov't Service (Y/N)"],
            workRows.map(r=>[r.dateFrom,r.dateTo,r.positionTitle,r.departmentAgencyOfficeCompany,"",r.statusOfAppointment,r.isGovtService==="Y"?"Yes":r.isGovtService==="N"?"No":"N/A"].map(formatExportValue))
          ),
          mkHeading("VI. Voluntary Work"),
          mkGrid(["Organization Name/Address","From","To","No. of Hours","Position/Nature of Work"],
            voluntaryRows.map(r=>[r.organizationNameAddress,r.dateFrom,r.dateTo,r.numberOfHours,r.positionNatureOfWork].map(formatExportValue))
          ),
          mkHeading("VII. Learning and Development (L&D)"),
          mkGrid(["Title","From","To","No. of Hours","Type of L&D","Conducted/Sponsored By"],
            trainingRows.map(r=>[r.title,r.dateFrom,r.dateTo,r.numberOfHours,r.typeOfLd,r.conductedSponsoredBy].map(formatExportValue))
          ),
          mkHeading("VIII. Other Information"),
          mkGrid(["Special Skills/Hobbies","Non-Academic Distinctions/Recognition","Memberships/Organization"],
            otherInfoRows.map(r=>[r.specialSkillsHobbies,r.nonAcademicDistinctionsRecognition,r.membershipsAssociationOrganization].map(formatExportValue))
          ),
          mkKV([["References", formatExportValue(applicant.referencesInfo)]]),
          mkHeading("IX. Applications"),
          mkGrid(["Position","Status","Date Applied","Remarks"], applicationRows),
          mkHeading("X. Submitted Documents"),
          mkGrid(["Document Name","Type"], documentRows)
        ]}]});

        const blob = await Packer.toBlob(doc);
        const url  = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileNameBase}_PDS.docx`;
        link.click();
        URL.revokeObjectURL(url);
      }

      toast({ title: "Export complete", description: `PDS exported as ${format.toUpperCase()} successfully.` });
    } catch (error) {
      toast({ title: "Export failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsExportingApplicant(false);
    }
  };

  const handlePrintApplicant = () => {
    if (!viewingApplicantId) return;

    const applicant = applicants.find((entry) => entry.id === viewingApplicantId);
    if (!applicant) {
      toast({ title: "Print failed", description: "Applicant not found.", variant: "destructive" });
      return;
    }

    // Parse all related data
    const educationRows = parseEducationalBackground(applicant.educationalBackground || "");
    const civilServiceRows = parseCivilServiceEligibility(applicant.civilServiceEligibility || "");
    const workRows = parseWorkExperience(applicant.workExperience || "");
    const voluntaryRows = parseVoluntaryWork(applicant.voluntaryWork || "");
    const trainingRows = parseTrainings(applicant.trainings || "");
    const otherInfoRows = parseOtherInfo(applicant.otherInfo || "");
    const children = parseChildrenInfo(applicant.childrenInfo || "").filter(
      (c) => c.fullName.trim() || c.dateOfBirth
    );
    const apps = getApplicantApplications(applicant.id);

    // Name parts
    const np = splitFullName(applicant.fullName || "");

    // Normalize helpers (same logic as PDF export)
    const pickFirst = (raw: string, options: string[]): string => {
      if (!raw) return "";
      const r = raw.trim();
      const exact = options.find(o => o.toLowerCase() === r.toLowerCase());
      if (exact) return exact;
      return options.find(o => r.toLowerCase().includes(o.toLowerCase())) || r;
    };
    const sexNorm    = pickFirst(applicant.sex || "", ["Male", "Female"]);
    const csOptions  = ["Single", "Married", "Widowed", "Separated", "Other"];
    const csNorm     = pickFirst(applicant.civilStatus || "", csOptions);
    const citizNorm  = pickFirst(applicant.citizenship || "", ["Filipino", "Dual Citizenship"]);
    const isFil      = citizNorm === "Filipino";
    const isDual     = citizNorm === "Dual Citizenship";

    // Checkbox helper
    const chk = (checked: boolean) => checked ? "&#10003;" : "&#9744;";

    // ── Unified row heights (px) ──────────────────────────────────────────────
    // One value for every standard personal-info row so every row looks identical.
    const RH      = 22;   // ALL standard rows: name, DOB, address, email, IDs, family
    const RH_NAME = RH;
    const RH_STD  = RH;
    const RH_CITIZ= RH;
    const RH_ADDR = RH;
    const RH_EMAIL= RH;
    const RH_IDS  = RH;
    const RH_FAM  = RH;
    const RH_CHKBX= 30;  // Checkbox rows only — extra 8px for the tick + label pair
    const RH_CHILD= 18;  // Children table data rows
    const RH_DATA = 18;  // Section III-VIII data rows
    const RH_BAR  = 18;  // Section/sub header bars

    // ── Label-value cell ─────────────────────────────────────────────────────
    // Uses a flex column so the label always sits at the top and the value fills
    // the rest. overflow:hidden + white-space:nowrap on the value prevents any
    // expansion beyond the declared height.
    const lvc = (label: string, value: string, rh: number, tdStyle = "") =>
      `<td style="padding:0;vertical-align:top;overflow:hidden;height:${rh}px;max-height:${rh}px;line-height:1;${tdStyle}">` +
        `<div style="font-size:5.5pt;color:#666;padding:1px 3px 0;line-height:1.1;white-space:nowrap;overflow:hidden;">${label}</div>` +
        `<div style="font-size:7.5pt;padding:1px 3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${value || "&nbsp;"}</div>` +
      `</td>`;

    // ── Checkbox cell ────────────────────────────────────────────────────────
    // All checkbox options on ONE line — no <br> allowed here.
    // font-size shrunk to 6.5pt so 5 civil-status options fit horizontally.
    const chkCell = (labelNum: string, content: string, rh: number, tdStyle = "") =>
      `<td style="padding:0;vertical-align:top;overflow:hidden;height:${rh}px;max-height:${rh}px;line-height:1;${tdStyle}">` +
        `<div style="font-size:5.5pt;color:#666;padding:1px 3px 0;line-height:1.1;white-space:nowrap;overflow:hidden;">${labelNum}</div>` +
        `<div style="font-size:6.5pt;padding:1px 3px 0;white-space:nowrap;overflow:hidden;">${content}</div>` +
      `</td>`;

    // ── Column header cell ───────────────────────────────────────────────────
    const hdr = (label: string, tdStyle = "") =>
      `<th style="background:#dcdcdc;font-size:6pt;font-weight:bold;text-align:center;padding:2px;border:0.3px solid #555;vertical-align:middle;${tdStyle}">${label}</th>`;

    // ── Data cell (sections III-VIII) ────────────────────────────────────────
    const dc = (value: string, tdStyle = "") =>
      `<td style="font-size:7pt;padding:1px 3px;border:0.3px solid #555;height:${RH_DATA}px;max-height:${RH_DATA}px;overflow:hidden;vertical-align:middle;white-space:nowrap;text-overflow:ellipsis;${tdStyle}">${value || ""}</td>`;

    // ── Section header bar ───────────────────────────────────────────────────
    const secHdr = (num: string, title: string) =>
      `<tr><td colspan="100" style="background:#404040;color:white;font-weight:bold;font-size:8pt;padding:2px 5px;border:0.3px solid #555;height:${RH_BAR}px;max-height:${RH_BAR}px;overflow:hidden;white-space:nowrap;">${num}&nbsp;&nbsp;${title.toUpperCase()}</td></tr>`;

    // ── Sub-bar (medium gray) ────────────────────────────────────────────────
    const subBar = (title: string) =>
      `<tr><td colspan="100" style="background:#a0a0a0;color:white;font-weight:bold;font-size:7.5pt;padding:2px 5px;border:0.3px solid #555;height:${RH_BAR}px;max-height:${RH_BAR}px;overflow:hidden;white-space:nowrap;">${title}</td></tr>`;

    // Ensure minimum rows for table sections
    const padRows = <T extends object>(rows: T[], min: number, empty: T): T[] => {
      const result = [...rows];
      while (result.length < min) result.push(empty);
      return result;
    };

    const eduPadded      = padRows(educationRows,   5,  { level:"", schoolName:"", degreeCourse:"", attendanceFrom:"", attendanceTo:"", highestLevelUnitsEarned:"", yearGraduated:"", scholarshipHonors:"" });
    const civPadded      = padRows(civilServiceRows, 3,  { eligibility:"", rating:"", examDate:"", examPlace:"", licenseNumber:"", licenseValidUntil:"" });
    const workPadded     = padRows(workRows,         5,  { dateFrom:"", dateTo:"", positionTitle:"", departmentAgencyOfficeCompany:"", statusOfAppointment:"", isGovtService:"" as const });
    const volPadded      = padRows(voluntaryRows,    3,  { organizationNameAddress:"", dateFrom:"", dateTo:"", numberOfHours:"", positionNatureOfWork:"" });
    const trainPadded    = padRows(trainingRows,     3,  { title:"", dateFrom:"", dateTo:"", numberOfHours:"", typeOfLd:"", conductedSponsoredBy:"" });
    const childPadded    = padRows(children,         5,  { fullName:"", dateOfBirth:"" });
    const otherPadded    = padRows(otherInfoRows,    3,  { specialSkillsHobbies:"", nonAcademicDistinctionsRecognition:"", membershipsAssociationOrganization:"" });

    // Create print window
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: "Print failed", description: "Unable to open print window.", variant: "destructive" });
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${applicant.fullName} - Personal Data Sheet</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 8pt; line-height: 1.3; background: #fff; color: #000; }
            .page { width: 8.27in; margin: 0 auto; padding: 8mm; page-break-after: always; }
            .page:last-child { page-break-after: auto; }
            table.pds { width: 100%; border-collapse: collapse; }
            table.pds td, table.pds th { border: 0.3px solid #555; }
            .sec-row td { background: #404040; color: white; font-weight: bold; font-size: 8pt; padding: 3px 5px; }
            .sub-row td { background: #a0a0a0; color: white; font-weight: bold; font-size: 7.5pt; padding: 2px 5px; }
            .strip { background: #f2f2f2; font-size: 7pt; padding: 2px 5px; border: 0.3px solid #aaa; }
            @media print {
              body { margin: 0; }
              .page { padding: 8mm; page-break-after: always; }
              .page:last-child { page-break-after: auto; }
            }
          </style>
        </head>
        <body>

          <!-- ═══════════════════════════════════════════════════════ PAGE 1 -->
          <div class="page">
            <table class="pds">
              <!-- Top meta row -->
              <tr>
                <td colspan="90" style="background:#f2f2f2;text-align:center;font-weight:bold;font-size:8pt;padding:3px;height:${RH_BAR}px;max-height:${RH_BAR}px;overflow:hidden;white-space:nowrap;">CS Form No. 212</td>
                <td colspan="10" style="background:#f2f2f2;text-align:center;font-size:7pt;padding:3px;height:${RH_BAR}px;max-height:${RH_BAR}px;overflow:hidden;white-space:nowrap;">Revised 2017</td>
              </tr>
              <!-- Title -->
              <tr><td colspan="100" style="background:#404040;color:white;text-align:center;font-weight:bold;font-size:12pt;padding:5px;height:24px;max-height:24px;overflow:hidden;white-space:nowrap;">PERSONAL DATA SHEET</td></tr>
              <!-- Warning -->
              <tr><td colspan="100" style="background:#f2f2f2;font-size:5.5pt;color:#800;font-weight:bold;padding:2px 5px;height:${RH_BAR}px;max-height:${RH_BAR}px;overflow:hidden;white-space:nowrap;">
                WARNING: Any misrepresentation made in the Personal Data Sheet and the Work Experience Sheet shall cause the filing of administrative/criminal case/s against the person concerned.
              </td></tr>
              <!-- Instruction -->
              <tr><td colspan="100" style="font-size:5.5pt;font-style:italic;color:#555;padding:2px 5px;height:${RH_BAR}px;max-height:${RH_BAR}px;overflow:hidden;white-space:nowrap;">
                Print legibly. Tick appropriate boxes ( &#10003; ) and use separate sheet if necessary. Indicate N/A if not applicable. DO NOT ABBREVIATE.
              </td></tr>

              <!-- ── I. Personal Information ── -->
              ${secHdr("I.", "Personal Information")}

              <!-- Row 1: Surname | First Name | Middle Name | Ext -->
              <tr>
                ${lvc("1.&nbsp;&nbsp;SURNAME", np.lastName, RH_NAME, "width:27%;")}
                ${lvc("FIRST NAME", np.firstName, RH_NAME, "width:27%;")}
                ${lvc("MIDDLE NAME", np.middleName, RH_NAME, "width:27%;")}
                ${lvc("NAME EXTENSION (JR, SR)", np.extensionName, RH_NAME, "width:19%;")}
              </tr>

              <!-- Row 2: Date of Birth | Place of Birth -->
              <tr>
                ${lvc("2.&nbsp;&nbsp;DATE OF BIRTH (mm/dd/yyyy)", applicant.dateOfBirth || "", RH_STD, "width:30%;")}
                ${lvc("3.&nbsp;&nbsp;PLACE OF BIRTH", applicant.placeOfBirth || "", RH_STD, "width:70%;")}
              </tr>

              <!-- Row 3: Sex | Civil Status | Height | Weight | Blood Type -->
              <tr>
                ${lvc("4.&nbsp;&nbsp;SEX", sexNorm || "N/A", RH_CHKBX, "width:14%;")}
                ${lvc("5.&nbsp;&nbsp;CIVIL STATUS", csNorm || "N/A", RH_CHKBX, "width:22%;")}
                ${lvc("6.&nbsp;&nbsp;HEIGHT (m)", applicant.height || "", RH_CHKBX, "width:14%;")}
                ${lvc("7.&nbsp;&nbsp;WEIGHT (kg)", applicant.weight || "", RH_CHKBX, "width:14%;")}
                ${lvc("8.&nbsp;&nbsp;BLOOD TYPE", applicant.bloodType || "", RH_CHKBX, "width:36%;")}
              </tr>

              <!-- Row 4: Citizenship | Telephone | Mobile -->
              <tr>
                ${lvc("9.&nbsp;&nbsp;CITIZENSHIP", citizNorm + (isDual && applicant.citizenshipDetails ? " — " + applicant.citizenshipDetails : ""), RH_CITIZ, "width:50%;")}
                ${lvc("10.&nbsp;&nbsp;TELEPHONE NO.", applicant.telephoneNumber || "", RH_CITIZ, "width:25%;")}
                ${lvc("11.&nbsp;&nbsp;MOBILE NO.", applicant.contactNumber || "", RH_CITIZ, "width:25%;")}
              </tr>

              <!-- Row 5: Residential Address -->
              <tr>
                ${lvc("12.&nbsp;&nbsp;RESIDENTIAL ADDRESS (House/Block/Lot No., Street, Subdivision/Village, Barangay, City/Municipality, Province, Zip Code)",
                  applicant.address || "", RH_ADDR, "width:100%;")}
              </tr>

              <!-- Row 6: Permanent Address -->
              <tr>
                ${lvc("13.&nbsp;&nbsp;PERMANENT ADDRESS (House/Block/Lot No., Street, Subdivision/Village, Barangay, City/Municipality, Province, Zip Code)",
                  applicant.permanentAddress || applicant.address || "", RH_ADDR, "width:100%;")}
              </tr>

              <!-- Row 7: Email -->
              <tr>
                ${lvc("14.&nbsp;&nbsp;EMAIL ADDRESS (if any)", applicant.email || "", RH_EMAIL, "width:100%;")}
              </tr>

              <!-- Row 8: IDs row 1 -->
              <tr>
                ${lvc("15.&nbsp;&nbsp;GSIS ID NO.", applicant.gsisIdNo || "", RH_IDS, "width:25%;")}
                ${lvc("16.&nbsp;&nbsp;PAG-IBIG ID NO.", applicant.pagibigIdNo || "", RH_IDS, "width:25%;")}
                ${lvc("17.&nbsp;&nbsp;PHILHEALTH NO.", applicant.philhealthNo || "", RH_IDS, "width:25%;")}
                ${lvc("18.&nbsp;&nbsp;SSS NO.", applicant.sssNo || "", RH_IDS, "width:25%;")}
              </tr>

              <!-- Row 9: IDs row 2 -->
              <tr>
                ${lvc("19.&nbsp;&nbsp;TIN NO.", applicant.tinNo || "", RH_IDS, "width:33%;")}
                ${lvc("20.&nbsp;&nbsp;AGENCY EMPLOYEE NO.", applicant.agencyEmployeeNo || "", RH_IDS, "width:34%;")}
                ${lvc("21.&nbsp;&nbsp;PHILSYS NO. (PSN)", applicant.philsysNo || "", RH_IDS, "width:33%;")}
              </tr>

              <!-- ── II. Family Background ── -->
              ${secHdr("II.", "Family Background")}

              <!-- SPOUSE -->
              ${subBar("SPOUSE")}
              <tr>
                ${lvc("22.&nbsp;&nbsp;SURNAME", applicant.spouseSurname || "", RH_FAM, "width:26%;")}
                ${lvc("FIRST NAME", applicant.spouseFirstName || "", RH_FAM, "width:26%;")}
                ${lvc("MIDDLE NAME", applicant.spouseMiddleName || "", RH_FAM, "width:28%;")}
                ${lvc("NAME EXT.", applicant.spouseNameExtension || "", RH_FAM, "width:20%;")}
              </tr>
              <tr>
                ${lvc("OCCUPATION", applicant.spouseOccupation || "", RH_FAM, "width:30%;")}
                ${lvc("EMPLOYER/BUSINESS NAME", applicant.spouseEmployerBusinessName || "", RH_FAM, "width:45%;")}
                ${lvc("TELEPHONE NO.", applicant.spouseTelephoneNo || "", RH_FAM, "width:25%;")}
              </tr>
              <tr>
                ${lvc("BUSINESS ADDRESS", applicant.spouseBusinessAddress || "", RH_FAM, "width:100%;")}
              </tr>

              <!-- FATHER -->
              ${subBar("FATHER")}
              <tr>
                ${lvc("23.&nbsp;&nbsp;SURNAME", applicant.fatherSurname || "", RH_FAM, "width:26%;")}
                ${lvc("FIRST NAME", applicant.fatherFirstName || "", RH_FAM, "width:26%;")}
                ${lvc("MIDDLE NAME", applicant.fatherMiddleName || "", RH_FAM, "width:28%;")}
                ${lvc("NAME EXT", applicant.fatherNameExtension || "", RH_FAM, "width:20%;")}
              </tr>

              <!-- MOTHER'S MAIDEN NAME -->
              ${subBar("MOTHER'S MAIDEN NAME")}
              <tr>
                ${lvc("24.&nbsp;&nbsp;SURNAME", applicant.motherSurname || "", RH_FAM, "width:26%;")}
                ${lvc("FIRST NAME", applicant.motherFirstName || "", RH_FAM, "width:26%;")}
                ${lvc("MIDDLE NAME", applicant.motherMiddleName || "", RH_FAM, "width:48%;")}
              </tr>

              <!-- Children -->
              <tr><td colspan="100" style="background:#dcdcdc;font-weight:bold;font-size:7.5pt;padding:2px 5px;height:${RH_BAR}px;max-height:${RH_BAR}px;overflow:hidden;white-space:nowrap;">
                25.&nbsp;&nbsp;NAME OF CHILDREN (Write full name and list all)
              </td></tr>
              <tr>
                ${hdr("FULL NAME OF CHILDREN (Family Name, First Name, Middle Name)", "width:55%;")}
                ${hdr("DATE OF BIRTH (mm/dd/yyyy)", "width:45%;")}
              </tr>
              ${childPadded.map(c => `<tr>${dc(c.fullName)}${dc(c.dateOfBirth)}</tr>`).join("")}
            </table>
          </div>

          <!-- ═══════════════════════════════════════════════════════ PAGE 2 -->
          <div class="page">
            <table class="pds">
              ${secHdr("III.", "Educational Background")}
              <tr>
                ${hdr("LEVEL", "width:10%;")}
                ${hdr("NAME OF SCHOOL (Write in full)", "width:22%;")}
                ${hdr("BASIC EDUCATION/ DEGREE/COURSE (Write in full)", "width:18%;")}
                ${hdr("FROM", "width:7%;")}
                ${hdr("TO", "width:7%;")}
                ${hdr("HIGHEST LEVEL/ UNITS EARNED (if not graduated)", "width:13%;")}
                ${hdr("YEAR GRADUATED", "width:10%;")}
                ${hdr("SCHOLARSHIP/ ACADEMIC HONORS RECEIVED", "width:13%;")}
              </tr>
              ${eduPadded.map(r => `
                <tr>
                  ${dc(r.level)}${dc(r.schoolName)}${dc(r.degreeCourse)}
                  ${dc(r.attendanceFrom)}${dc(r.attendanceTo)}
                  ${dc(r.highestLevelUnitsEarned)}${dc(r.yearGraduated)}${dc(r.scholarshipHonors)}
                </tr>`).join("")}

              ${secHdr("IV.", "Civil Service Eligibility")}
              <tr>
                ${hdr("CAREER SERVICE/ RA 1080 (BOARD/ BAR) UNDER SPECIAL LAWS/ CES/ CSEE BARANGAY ELIGIBILITY / DRIVER'S LICENSE", "width:32%;")}
                ${hdr("RATING (If Applicable)", "width:12%;")}
                ${hdr("DATE OF EXAMINATION/ CONFERMENT", "width:14%;")}
                ${hdr("PLACE OF EXAMINATION/ CONFERMENT", "width:22%;")}
                ${hdr("LICENSE (if applicable) NUMBER", "width:10%;")}
                ${hdr("DATE OF VALIDITY", "width:10%;")}
              </tr>
              ${civPadded.map(r => `
                <tr>
                  ${dc(r.eligibility)}${dc(r.rating)}${dc(r.examDate)}
                  ${dc(r.examPlace)}${dc(r.licenseNumber)}${dc(r.licenseValidUntil)}
                </tr>`).join("")}

              ${secHdr("V.", "Work Experience")}
              <tr>
                ${hdr("FROM", "width:8%;")}
                ${hdr("TO", "width:8%;")}
                ${hdr("POSITION TITLE (Write in full/Do not abbreviate)", "width:20%;")}
                ${hdr("DEPARTMENT/ AGENCY/ OFFICE/ COMPANY (Write in full/Do not abbreviate)", "width:25%;")}
                ${hdr("MONTHLY SALARY", "width:10%;")}
                ${hdr("SALARY/ JOB/ PAY GRADE (if applicable) & STEP (Format '00-0')", "width:13%;")}
                ${hdr("STATUS OF APPOINTMENT", "width:9%;")}
                ${hdr("GOV'T SERVICE (Y/N)", "width:7%;")}
              </tr>
              ${workPadded.map(r => `
                <tr>
                  ${dc(r.dateFrom)}${dc(r.dateTo)}${dc(r.positionTitle)}
                  ${dc(r.departmentAgencyOfficeCompany)}${dc("")}${dc("")}
                  ${dc(r.statusOfAppointment)}
                  ${dc(r.isGovtService === "Y" ? "Yes" : r.isGovtService === "N" ? "No" : "")}
                </tr>`).join("")}
            </table>
          </div>

          <!-- ═══════════════════════════════════════════════════════ PAGE 3 -->
          <div class="page">
            <table class="pds">
              ${secHdr("VI.", "Voluntary Work or Involvement in Civic/Non-Government/People/Voluntary Organizations")}
              <tr>
                ${hdr("NAME & ADDRESS OF ORGANIZATION (Write in full)", "width:38%;")}
                ${hdr("FROM", "width:10%;")}
                ${hdr("TO", "width:10%;")}
                ${hdr("NUMBER OF HOURS", "width:12%;")}
                ${hdr("POSITION/ NATURE OF WORK", "width:30%;")}
              </tr>
              ${volPadded.map(r => `
                <tr>
                  ${dc(r.organizationNameAddress)}${dc(r.dateFrom)}${dc(r.dateTo)}
                  ${dc(r.numberOfHours)}${dc(r.positionNatureOfWork)}
                </tr>`).join("")}

              ${secHdr("VII.", "Learning and Development (L&D) Interventions/Training Programs Attended")}
              <tr>
                ${hdr("TITLE OF LEARNING AND DEVELOPMENT INTERVENTIONS/ TRAINING PROGRAMS (Write in full)", "width:30%;")}
                ${hdr("INCLUSIVE DATES OF ATTENDANCE FROM", "width:10%;")}
                ${hdr("TO", "width:10%;")}
                ${hdr("NUMBER OF HOURS", "width:10%;")}
                ${hdr("TYPE OF LD (Managerial/ Supervisory/ Technical/ etc)", "width:15%;")}
                ${hdr("CONDUCTED/ SPONSORED BY (Write in full)", "width:25%;")}
              </tr>
              ${trainPadded.map(r => `
                <tr>
                  ${dc(r.title)}${dc(r.dateFrom)}${dc(r.dateTo)}
                  ${dc(r.numberOfHours)}${dc(r.typeOfLd)}${dc(r.conductedSponsoredBy)}
                </tr>`).join("")}

              ${secHdr("VIII.", "Other Information")}
              <tr>
                ${hdr("SPECIAL SKILLS and HOBBIES", "width:33%;")}
                ${hdr("NON-ACADEMIC DISTINCTIONS / RECOGNITION (Write in full)", "width:34%;")}
                ${hdr("MEMBERSHIP IN ASSOCIATION/ ORGANIZATION (Write in full)", "width:33%;")}
              </tr>
              ${otherPadded.map(r => `
                <tr>
                  ${dc(r.specialSkillsHobbies)}${dc(r.nonAcademicDistinctionsRecognition)}${dc(r.membershipsAssociationOrganization)}
                </tr>`).join("")}

              <!-- References -->
              <tr><td colspan="100" style="padding:0;vertical-align:top;border:0.3px solid #555;">
                <div style="font-size:6.5pt;font-weight:bold;color:#333;padding:3px 5px 1px 5px;">REFERENCES (Person not related by consanguinity or affinity to applicant/appointee)</div>
                <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                  <tr>
                    ${hdr("NAME", "width:40%;")}
                    ${hdr("ADDRESS", "width:40%;")}
                    ${hdr("TEL. NO.", "width:20%;")}
                  </tr>
                  <tr>${dc("")}${dc("")}${dc("")}</tr>
                  <tr>${dc("")}${dc("")}${dc("")}</tr>
                  <tr>${dc("")}${dc("")}${dc("")}</tr>
                </table>
                <div style="font-size:7.5pt;padding:4px 5px 2px 5px;min-height:16px;">
                  ${applicant.referencesInfo || ""}
                </div>
              </td></tr>

              <!-- Declaration -->
              <tr><td colspan="100" style="padding:6px 8px;border:0.3px solid #555;">
                <div style="font-size:6.5pt;font-style:italic;margin-bottom:6px;">
                  I declare under oath that I have personally accomplished this Personal Data Sheet which is a true, correct and complete statement pursuant to the provisions of pertinent laws, rules and regulations of the Republic of the Philippines. I authorize the agency head/authorized representative to verify/validate the contents stated herein. I agree that any misrepresentation made in this document and its attachments shall cause the filing of administrative and/or criminal case/s against me.
                </div>
                <div style="display:flex;justify-content:space-between;padding:10px 0 0 0;">
                  <div style="text-align:center;width:45%;">
                    <div style="border-top:1px solid #333;margin-top:35px;"></div>
                    <div style="font-size:7pt;margin-top:2px;">Signature</div>
                  </div>
                  <div style="text-align:center;width:45%;">
                    <div style="border-top:1px solid #333;margin-top:35px;"></div>
                    <div style="font-size:7pt;margin-top:2px;">Date Accomplished</div>
                  </div>
                </div>
                <div style="margin-top:10px;border:0.5px solid #555;padding:4px;">
                  <div style="font-size:7pt;font-weight:bold;margin-bottom:4px;">SUBSCRIBED AND SWORN to before me this ___ day of ____________, _______ at ________________________, Philippines.</div>
                  <div style="display:flex;justify-content:space-between;margin-top:12px;">
                    <div style="text-align:center;width:45%;">
                      <div style="border-top:1px solid #333;margin-top:20px;"></div>
                      <div style="font-size:7pt;">Administering Officer</div>
                    </div>
                    <div style="text-align:center;width:45%;">
                      <div style="border-top:1px solid #333;margin-top:20px;"></div>
                      <div style="font-size:7pt;">Position/Title/Appointment</div>
                    </div>
                  </div>
                </div>
              </td></tr>
            </table>
          </div>

        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => { printWindow.print(); }, 250);
    };
  };

  const selectedRegionName = useMemo(
    () => regionUnits.find((region) => region.code === addressParts.regionCode)?.name ?? "",
    [regionUnits, addressParts.regionCode]
  );

  const selectedCity = useMemo(
    () => cityUnits.find((city) => city.code === addressParts.cityCode),
    [cityUnits, addressParts.cityCode]
  );

  const selectedCityName = selectedCity?.name ?? "";

  const selectedBarangayName = useMemo(
    () => barangayUnits.find((barangay) => barangay.code === addressParts.barangayCode)?.name ?? "",
    [barangayUnits, addressParts.barangayCode]
  );

  const regionOptions = useMemo<SearchableOption[]>(
    () =>
      regionUnits
        .map((region) => ({ value: region.code, label: region.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [regionUnits]
  );

  const cityOptions = useMemo<SearchableOption[]>(
    () => cityUnits.map((city) => ({ value: city.code, label: city.name })),
    [cityUnits]
  );

  const barangayOptions = useMemo<SearchableOption[]>(
    () => barangayUnits.map((barangay) => ({ value: barangay.code, label: barangay.name })),
    [barangayUnits]
  );

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: currentYear - 1949 }, (_, index) => String(currentYear - index));
  }, []);

  const filteredAddressSuggestions = useMemo(() => {
    const query = formState.address.trim().toLowerCase();
    if (!query) {
      return [];
    }
    return addressSuggestions
      .filter((suggestion) => suggestion.toLowerCase().includes(query))
      .slice(0, 6);
  }, [formState.address]);

  useEffect(() => {
    let isCancelled = false;

    const loadRegions = async () => {
      setIsLoadingRegions(true);
      try {
        const response = await fetch(`${PSGC_BASE_URL}/regions`);
        const data = (await response.json()) as RegionUnit[];
        if (!isCancelled) {
          setRegionUnits(data);
        }
      } catch {
        if (!isCancelled) {
          toast({
            title: "Address data unavailable",
            description: "Unable to load Philippines region list right now.",
            variant: "destructive"
          });
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingRegions(false);
        }
      }
    };

    loadRegions();

    return () => {
      isCancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    let isCancelled = false;

    const loadLocalities = async () => {
      if (!addressParts.regionCode) {
        setCityUnits([]);
        setBarangayUnits([]);
        return;
      }

      setIsLoadingCities(true);
      setBarangayUnits([]);

      try {
        const [citiesResponse, municipalitiesResponse] = await Promise.all([
          fetch(`${PSGC_BASE_URL}/regions/${addressParts.regionCode}/cities`).then((response) =>
            response.ok ? response.json() : []
          ),
          fetch(`${PSGC_BASE_URL}/regions/${addressParts.regionCode}/municipalities`).then((response) =>
            response.ok ? response.json() : []
          )
        ]);

        if (!isCancelled) {
          const normalizedCities = (citiesResponse as Array<{ code: string; name: string }>).map((city) => ({
            code: city.code,
            name: city.name,
            type: "city" as const
          }));
          const normalizedMunicipalities = (municipalitiesResponse as Array<{ code: string; name: string }>).map((municipality) => ({
            code: municipality.code,
            name: municipality.name,
            type: "municipality" as const
          }));

          setCityUnits(
            [...normalizedCities, ...normalizedMunicipalities].sort((a, b) => a.name.localeCompare(b.name))
          );
        }
      } catch {
        if (!isCancelled) {
          toast({
            title: "Address data unavailable",
            description: "Unable to load cities and municipalities for the selected region.",
            variant: "destructive"
          });
          setCityUnits([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingCities(false);
        }
      }
    };

    loadLocalities();

    return () => {
      isCancelled = true;
    };
  }, [addressParts.regionCode, toast]);

  useEffect(() => {
    let isCancelled = false;

    const loadBarangays = async () => {
      if (!selectedCity) {
        setBarangayUnits([]);
        return;
      }

      setIsLoadingBarangays(true);
      try {
        const endpoint = selectedCity.type === "city" ? "cities" : "municipalities";
        const response = await fetch(`${PSGC_BASE_URL}/${endpoint}/${selectedCity.code}/barangays`);
        const data = response.ok ? ((await response.json()) as BarangayUnit[]) : [];

        if (!isCancelled) {
          setBarangayUnits(data.sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch {
        if (!isCancelled) {
          toast({
            title: "Address data unavailable",
            description: "Unable to load barangays for the selected city/municipality.",
            variant: "destructive"
          });
          setBarangayUnits([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingBarangays(false);
        }
      }
    };

    loadBarangays();

    return () => {
      isCancelled = true;
    };
  }, [selectedCity, toast]);

  const resetCreateForm = () => {
    setFormState({
      fullName: "",
      contactNumber: "",
      telephoneNumber: "",
      email: "",
      address: "",
      permanentAddress: "",
      dateOfBirth: "",
      placeOfBirth: "",
      sex: "",
      civilStatus: "",
      citizenship: "",
      height: "",
      weight: "",
      bloodType: "",
      gsisIdNo: "",
      philsysNo: "",
      pagibigIdNo: "",
      philhealthNo: "",
      citizenshipDetails: "",
      sssNo: "",
      tinNo: "",
      agencyEmployeeNo: "",
      spouseName: "",
      spouseSurname: "",
      spouseFirstName: "",
      spouseMiddleName: "",
      spouseNameExtension: "",
      spouseOccupation: "",
      spouseEmployerBusinessName: "",
      spouseBusinessAddress: "",
      spouseTelephoneNo: "",
      childrenInfo: "",
      fatherName: "",
      fatherSurname: "",
      fatherFirstName: "",
      fatherMiddleName: "",
      fatherNameExtension: "",
      motherName: "",
      motherSurname: "",
      motherFirstName: "",
      motherMiddleName: "",
      civilServiceEligibility: "",
      voluntaryWork: "",
      trainings: "",
      otherInfo: "",
      referencesInfo: "",
      educationalBackground: "",
      workExperience: ""
    });
    setNameParts({ firstName: "", middleName: "", lastName: "", extensionName: "" });
    setAddressParts({ regionCode: "", cityCode: "", barangayCode: "", streetAddress: "" });
    setCityUnits([]);
    setBarangayUnits([]);
    setDualCitizenshipType("");
    setChildrenEntries([{ fullName: "", dateOfBirth: "" }]);
    setEducationEntries(buildDefaultEducationEntries());
    setCivilServiceEntries([createCivilServiceEntry()]);
    setWorkExperienceEntries([createWorkExperienceEntry()]);
    setVoluntaryWorkEntries([createVoluntaryWorkEntry()]);
    setTrainingEntries([createTrainingEntry()]);
    setOtherInfoEntries([createOtherInfoEntry()]);
    setDocuments({ resume: null, transcript: null, certificates: [] });
  };

  const resolveParsedAddressToDropdowns = async (parsedAddress: string) => {
    const normalizedAddress = normalizeLocationText(parsedAddress);
    if (!normalizedAddress) return false;

    const availableRegions =
      regionUnits.length > 0
        ? regionUnits
        : ((await fetch(`${PSGC_BASE_URL}/regions`).then((response) => response.json())) as RegionUnit[]);

    if (regionUnits.length === 0) {
      setRegionUnits(availableRegions);
    }

    for (const region of availableRegions) {
      const [citiesResponse, municipalitiesResponse] = await Promise.all([
        fetch(`${PSGC_BASE_URL}/regions/${region.code}/cities`).then((response) => (response.ok ? response.json() : [])),
        fetch(`${PSGC_BASE_URL}/regions/${region.code}/municipalities`).then((response) => (response.ok ? response.json() : []))
      ]);

      const localities: LocalityUnit[] = [
        ...(citiesResponse as Array<{ code: string; name: string }>).map((city) => ({
          code: city.code,
          name: city.name,
          type: "city" as const
        })),
        ...(municipalitiesResponse as Array<{ code: string; name: string }>).map((municipality) => ({
          code: municipality.code,
          name: municipality.name,
          type: "municipality" as const
        }))
      ].sort((a, b) => b.name.length - a.name.length);

      const matchedLocality = localities.find((locality) => {
        const normalizedLocalityName = normalizeLocationText(locality.name);
        return normalizedLocalityName.length > 0 && normalizedAddress.includes(normalizedLocalityName);
      });

      if (!matchedLocality) {
        continue;
      }

      const endpoint = matchedLocality.type === "city" ? "cities" : "municipalities";
      const barangays = (await fetch(`${PSGC_BASE_URL}/${endpoint}/${matchedLocality.code}/barangays`).then((response) =>
        response.ok ? response.json() : []
      )) as BarangayUnit[];

      const matchedBarangay = barangays
        .sort((a, b) => b.name.length - a.name.length)
        .find((barangay) => normalizedAddress.includes(normalizeLocationText(barangay.name)));

      let streetAddress = parsedAddress.trim();
      streetAddress = removeMatchedAddressPart(streetAddress, region.name);
      streetAddress = removeMatchedAddressPart(streetAddress, matchedLocality.name);
      streetAddress = removeMatchedAddressPart(streetAddress, matchedBarangay?.name);
      streetAddress = streetAddress.replace(/^[,\s-]+|[,\s-]+$/g, "").trim();

      setCityUnits(localities.sort((a, b) => a.name.localeCompare(b.name)));
      setBarangayUnits(barangays.sort((a, b) => a.name.localeCompare(b.name)));
      setAddressParts({
        regionCode: region.code,
        cityCode: matchedLocality.code,
        barangayCode: matchedBarangay?.code ?? "",
        streetAddress
      });

      return true;
    }

    return false;
  };

  const applyParsedDraftToForm = (draft: ParsedApplicantDraft) => {
    const incomingCitizenship = draft.citizenship || "";
    const incomingDetailsRaw = draft.citizenshipDetails || "";
    let parsedDualType: "" | "By Birth" | "By Naturalization" = "";
    let parsedDualDetails = incomingDetailsRaw;

    if (/^By Birth:\s*/i.test(incomingDetailsRaw)) {
      parsedDualType = "By Birth";
      parsedDualDetails = incomingDetailsRaw.replace(/^By Birth:\s*/i, "");
    } else if (/^By Naturalization:\s*/i.test(incomingDetailsRaw)) {
      parsedDualType = "By Naturalization";
      parsedDualDetails = incomingDetailsRaw.replace(/^By Naturalization:\s*/i, "");
    }

    setDualCitizenshipType(incomingCitizenship === "Dual Citizenship" ? parsedDualType : "");
    setChildrenEntries(parseChildrenInfo(draft.childrenInfo || ""));
    setEducationEntries(parseEducationalBackground(draft.educationalBackground || ""));
    setCivilServiceEntries(parseCivilServiceEligibility(draft.civilServiceEligibility || ""));
    setWorkExperienceEntries(parseWorkExperience(draft.workExperience || ""));
    setVoluntaryWorkEntries(parseVoluntaryWork(draft.voluntaryWork || ""));
    setTrainingEntries(parseTrainings(draft.trainings || ""));
    setOtherInfoEntries(parseOtherInfo(draft.otherInfo || ""));

    if (draft.fullName) {
      setNameParts(splitFullName(draft.fullName));
    }

    setFormState((prev) => ({
      ...prev,
      contactNumber: draft.contactNumber || prev.contactNumber,
      telephoneNumber: draft.telephoneNumber || prev.telephoneNumber,
      email: draft.email || prev.email,
      permanentAddress: draft.permanentAddress || prev.permanentAddress,
      dateOfBirth: normalizeDateForInput(draft.dateOfBirth) || prev.dateOfBirth,
      placeOfBirth: draft.placeOfBirth || prev.placeOfBirth,
      sex: normalizeChoice(draft.sex, ["Male", "Female"]) || prev.sex,
      civilStatus: normalizeChoice(draft.civilStatus, ["Single", "Married", "Widowed", "Separated", "Divorced"]) || prev.civilStatus,
      citizenship: normalizeChoice(incomingCitizenship, ["Filipino", "Dual Citizenship", "Natural Born Filipino", "Naturalized Filipino"]) || prev.citizenship,
      height: draft.height || prev.height,
      weight: draft.weight || prev.weight,
      bloodType: draft.bloodType || prev.bloodType,
      gsisIdNo: draft.gsisIdNo || prev.gsisIdNo,
      philsysNo: draft.philsysNo || prev.philsysNo,
      pagibigIdNo: draft.pagibigIdNo || prev.pagibigIdNo,
      philhealthNo: draft.philhealthNo || prev.philhealthNo,
      citizenshipDetails: parsedDualDetails || prev.citizenshipDetails,
      sssNo: draft.sssNo || prev.sssNo,
      tinNo: draft.tinNo || prev.tinNo,
      agencyEmployeeNo: draft.agencyEmployeeNo || prev.agencyEmployeeNo,
      spouseName: draft.spouseName || prev.spouseName,
      spouseSurname: draft.spouseSurname || prev.spouseSurname,
      spouseFirstName: draft.spouseFirstName || prev.spouseFirstName,
      spouseMiddleName: draft.spouseMiddleName || prev.spouseMiddleName,
      spouseNameExtension: draft.spouseNameExtension || prev.spouseNameExtension,
      spouseOccupation: draft.spouseOccupation || prev.spouseOccupation,
      spouseEmployerBusinessName: draft.spouseEmployerBusinessName || prev.spouseEmployerBusinessName,
      spouseBusinessAddress: draft.spouseBusinessAddress || prev.spouseBusinessAddress,
      spouseTelephoneNo: draft.spouseTelephoneNo || prev.spouseTelephoneNo,
      childrenInfo: draft.childrenInfo || prev.childrenInfo,
      fatherName: draft.fatherName || prev.fatherName,
      fatherSurname: draft.fatherSurname || prev.fatherSurname,
      fatherFirstName: draft.fatherFirstName || prev.fatherFirstName,
      fatherMiddleName: draft.fatherMiddleName || prev.fatherMiddleName,
      fatherNameExtension: draft.fatherNameExtension || prev.fatherNameExtension,
      motherName: draft.motherName || prev.motherName,
      motherSurname: draft.motherSurname || prev.motherSurname,
      motherFirstName: draft.motherFirstName || prev.motherFirstName,
      motherMiddleName: draft.motherMiddleName || prev.motherMiddleName,
      civilServiceEligibility: draft.civilServiceEligibility || prev.civilServiceEligibility,
      voluntaryWork: draft.voluntaryWork || prev.voluntaryWork,
      trainings: draft.trainings || prev.trainings,
      otherInfo: draft.otherInfo || prev.otherInfo,
      referencesInfo: draft.referencesInfo || prev.referencesInfo,
      educationalBackground: draft.educationalBackground || prev.educationalBackground,
      workExperience: draft.workExperience || prev.workExperience
    }));

    if (draft.address) {
      setAddressParts((prev) => ({
        ...prev,
        streetAddress: draft.address
      }));
    }
  };

  const handleScanResumeAutofill = async () => {
    if (!documents.resume) {
      toast({
        title: "PDS required",
        description: "Upload a PDS first, then scan for autofill.",
        variant: "destructive"
      });
      return;
    }

    setIsScanningResume(true);
    try {
      const parsed = await parseApplicantDocument(documents.resume);
      applyParsedDraftToForm(parsed);

      if (parsed.address) {
        const mapped = await resolveParsedAddressToDropdowns(parsed.address);
        if (!mapped) {
          setAddressParts((prev) => ({ ...prev, streetAddress: parsed.address }));
          toast({
            title: "Address partially parsed",
            description: "Address text was captured, but please select region/city/barangay to complete it.",
            variant: "destructive"
          });
        }
      }

      toast({
        title: "Autofill ready",
        description: "Parsed PDS data has been applied. Review and edit before saving."
      });
    } catch (error) {
      toast({
        title: "Scan failed",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsScanningResume(false);
    }
  };

  const handleNextCreateSection = () => {
    if (createSectionIndex < createSectionIds.length - 1) {
      setCreateSectionIndex((prev) => prev + 1);
    }
  };

  const handlePreviousCreateSection = () => {
    if (createSectionIndex > 0) {
      setCreateSectionIndex((prev) => prev - 1);
    }
  };

  // Define helper function before using it in useMemo
  const getApplicantApplications = (applicantId: string) =>
    applications.filter((app) => app.applicantId === applicantId);

  const filtered = useMemo(() => {
    let result = applicants.filter((a) =>
      a.fullName.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
    );

    if (statusFilter && statusFilter !== "all") {
      result = result.filter((a) => {
        const apps = getApplicantApplications(a.id);
        return apps.some((app) => app.status === statusFilter);
      });
    }

    return result;
  }, [applicants, applications, search, statusFilter]);

  const openViewApplicant = (applicantId: string) => {
    setViewingApplicantId(applicantId);
    setShowView(true);
  };

  const openEditApplicant = (applicant: Applicant) => {
    setEditingApplicantId(applicant.id);
    setEditFormState({
      fullName: applicant.fullName,
      contactNumber: applicant.contactNumber,
      telephoneNumber: applicant.telephoneNumber,
      email: applicant.email,
      address: applicant.address,
      permanentAddress: applicant.permanentAddress,
      dateOfBirth: applicant.dateOfBirth,
      placeOfBirth: applicant.placeOfBirth,
      sex: applicant.sex,
      civilStatus: applicant.civilStatus,
      citizenship: applicant.citizenship,
      height: applicant.height,
      weight: applicant.weight,
      bloodType: applicant.bloodType,
      gsisIdNo: applicant.gsisIdNo,
      philsysNo: applicant.philsysNo,
      pagibigIdNo: applicant.pagibigIdNo,
      philhealthNo: applicant.philhealthNo,
      citizenshipDetails: applicant.citizenshipDetails,
      sssNo: applicant.sssNo,
      tinNo: applicant.tinNo,
      agencyEmployeeNo: applicant.agencyEmployeeNo,
      spouseName: applicant.spouseName,
      spouseSurname: applicant.spouseSurname,
      spouseFirstName: applicant.spouseFirstName,
      spouseMiddleName: applicant.spouseMiddleName,
      spouseNameExtension: applicant.spouseNameExtension,
      spouseOccupation: applicant.spouseOccupation,
      spouseEmployerBusinessName: applicant.spouseEmployerBusinessName,
      spouseBusinessAddress: applicant.spouseBusinessAddress,
      spouseTelephoneNo: applicant.spouseTelephoneNo,
      childrenInfo: applicant.childrenInfo,
      fatherName: applicant.fatherName,
      fatherSurname: applicant.fatherSurname,
      fatherFirstName: applicant.fatherFirstName,
      fatherMiddleName: applicant.fatherMiddleName,
      fatherNameExtension: applicant.fatherNameExtension,
      motherName: applicant.motherName,
      motherSurname: applicant.motherSurname,
      motherFirstName: applicant.motherFirstName,
      motherMiddleName: applicant.motherMiddleName,
      civilServiceEligibility: applicant.civilServiceEligibility,
      voluntaryWork: applicant.voluntaryWork,
      trainings: applicant.trainings,
      otherInfo: applicant.otherInfo,
      referencesInfo: applicant.referencesInfo,
      educationalBackground: applicant.educationalBackground,
      workExperience: applicant.workExperience
    });
    setEditDocuments({ resume: null, transcript: null, certificates: [] });
    setEditSectionIndex(0);
    setEditNameParts(splitFullName(applicant.fullName || ""));
    setEditChildrenEntries(parseChildrenInfo(applicant.childrenInfo || ""));
    setEditEducationEntries(parseEducationalBackground(applicant.educationalBackground || ""));
    setEditCivilServiceEntries(parseCivilServiceEligibility(applicant.civilServiceEligibility || ""));
    setEditWorkExperienceEntries(parseWorkExperience(applicant.workExperience || ""));
    setEditVoluntaryWorkEntries(parseVoluntaryWork(applicant.voluntaryWork || ""));
    setEditTrainingEntries(parseTrainings(applicant.trainings || ""));
    setEditOtherInfoEntries(parseOtherInfo(applicant.otherInfo || ""));
    // Pre-populate dual citizenship type for the edit form
    if (applicant.citizenship === "Dual Citizenship" && applicant.citizenshipDetails) {
      if (/^By Birth/i.test(applicant.citizenshipDetails)) {
        setEditDualCitizenshipType("By Birth");
      } else if (/^By Naturalization/i.test(applicant.citizenshipDetails)) {
        setEditDualCitizenshipType("By Naturalization");
      } else {
        setEditDualCitizenshipType("");
      }
    } else {
      setEditDualCitizenshipType("");
    }
    setShowEdit(true);
  };

  const openApplicantApplicationForm = (applicantId: string) => {
    setSelectedApplicantForApp(applicantId);
    setShowCreateApp(true);
  };

  useEffect(() => {
    const actionChecks: Array<["view" | "edit" | "apply", string | null]> = [
      ["view", searchParams.get("view")],
      ["edit", searchParams.get("edit")],
      ["apply", searchParams.get("apply")]
    ];
    const targetAction = actionChecks.find(([, value]) => Boolean(value));
    if (!targetAction) return;

    const [action, applicantId] = targetAction;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete(action);

    const applicant = applicants.find((entry) => entry.id === applicantId);
    if (!applicant) {
      toast({
        title: "Applicant not found",
        description: "The selected applicant record was not found.",
        variant: "destructive"
      });
      setSearchParams(nextParams, { replace: true });
      return;
    }

    if (action === "view") {
      openViewApplicant(applicant.id);
    }
    if (action === "edit") {
      openEditApplicant(applicant);
    }
    if (action === "apply") {
      openApplicantApplicationForm(applicant.id);
    }

    setSearchParams(nextParams, { replace: true });
  }, [applicants, searchParams, setSearchParams, toast]);

  const createMutation = useMutation({
    mutationFn: async (payload: typeof formState) => {
      const applicant = await createApplicant(payload);
      const uploads: Array<Promise<unknown>> = [];
      if (documents.resume) {
        uploads.push(uploadApplicantDocument(applicant.id, "pds", documents.resume));
      }
      if (documents.transcript) {
        uploads.push(uploadApplicantDocument(applicant.id, "transcript", documents.transcript));
      }
      documents.certificates.forEach((cert, idx) => {
        uploads.push(uploadApplicantDocument(applicant.id, `certificate_${idx + 1}`, cert));
      });
      await Promise.all(uploads);
      return applicant;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applicants"] });
      setShowCreate(false);
      resetCreateForm();
      toast({ title: "Applicant added", description: "The applicant was saved." });
    },
    onError: (error) => {
      toast({ title: "Save failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof editFormState }) => {
      await updateApplicant(id, payload);
      const uploads: Array<Promise<unknown>> = [];
      if (editDocuments.resume) {
        uploads.push(uploadApplicantDocument(id, "pds", editDocuments.resume));
      }
      if (editDocuments.transcript) {
        uploads.push(uploadApplicantDocument(id, "transcript", editDocuments.transcript));
      }
      editDocuments.certificates.forEach((cert, idx) => {
        uploads.push(uploadApplicantDocument(id, `certificate_${idx + 1}`, cert));
      });
      if (uploads.length > 0) {
        await Promise.all(uploads);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applicants"] });
      queryClient.invalidateQueries({ queryKey: ["applicant-documents-edit"] });
      setShowEdit(false);
      setEditingApplicantId(null);
      setEditDocuments({ resume: null, transcript: null, certificates: [] });
      toast({ title: "Applicant updated", description: "Changes saved." });
    },
    onError: (error) => {
      toast({ title: "Update failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const createAppMutation = useMutation({
    mutationFn: createApplication,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      setShowCreateApp(false);
      setSelectedApplicantForApp(null);
      setAppFormState({ vacancyId: "", dateApplied: new Date().toISOString().split("T")[0] });
      toast({ title: "Application added", description: "The applicant was added to application tracking." });
    },
    onError: (error) => {
      toast({ title: "Save failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Applicants</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} applicant(s)</p>
        </div>
        <Dialog
          open={showCreate}
          onOpenChange={(open) => {
            setShowCreate(open);
            setCreateSectionIndex(0);
            if (!open) {
              resetCreateForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Applicant</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add New Applicant</DialogTitle></DialogHeader>
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault();

              if (!nameParts.firstName.trim() || !nameParts.lastName.trim()) {
                toast({ title: "Missing name fields", description: "First name and last name are required.", variant: "destructive" });
                return;
              }

              if (formState.contactNumber && !/^09\d{9}$/.test(formState.contactNumber)) {
                toast({ title: "Invalid mobile number", description: "Use 11 digits starting with 09.", variant: "destructive" });
                return;
              }

              if (formState.telephoneNumber && !/^\d{7,11}$/.test(formState.telephoneNumber)) {
                toast({ title: "Invalid telephone number", description: "Use 7 to 11 digits only.", variant: "destructive" });
                return;
              }

              if (formState.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formState.email)) {
                toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
                return;
              }

              if (!formState.dateOfBirth) {
                toast({ title: "Missing date of birth", description: "Date of birth is required.", variant: "destructive" });
                return;
              }

              if (!formState.sex) {
                toast({ title: "Missing sex at birth", description: "Select sex at birth.", variant: "destructive" });
                return;
              }

              if (!formState.civilStatus) {
                toast({ title: "Missing civil status", description: "Select civil status.", variant: "destructive" });
                return;
              }

              if (!formState.citizenship) {
                toast({ title: "Missing citizenship", description: "Select citizenship.", variant: "destructive" });
                return;
              }

              if (formState.citizenship === "Dual Citizenship" && !dualCitizenshipType) {
                toast({ title: "Missing dual citizenship type", description: "Select By Birth or By Naturalization.", variant: "destructive" });
                return;
              }

              if (formState.citizenship === "Dual Citizenship" && !formState.citizenshipDetails.trim()) {
                toast({ title: "Missing dual citizenship details", description: "Provide dual citizenship details.", variant: "destructive" });
                return;
              }

              const fullName = formatFullName(nameParts);
              const address = formState.address.trim() || "Address not provided";
              const dualCitizenshipDetails = dualCitizenshipType
                ? `${dualCitizenshipType}: ${formState.citizenshipDetails.trim()}`
                : formState.citizenshipDetails.trim();
              const childrenInfo = serializeChildrenInfo(childrenEntries);
              const educationalBackground = serializeEducationalBackground(educationEntries);
              const civilServiceEligibility = serializeCivilServiceEligibility(civilServiceEntries);
              const workExperience = serializeWorkExperience(workExperienceEntries);
              const voluntaryWork = serializeVoluntaryWork(voluntaryWorkEntries);
              const trainings = serializeTrainings(trainingEntries);
              const otherInfo = serializeOtherInfo(otherInfoEntries);

              createMutation.mutate({
                fullName,
                contactNumber: formState.contactNumber,
                telephoneNumber: formState.telephoneNumber,
                email: formState.email,
                address,
                permanentAddress: formState.permanentAddress,
                dateOfBirth: formState.dateOfBirth,
                placeOfBirth: formState.placeOfBirth,
                sex: formState.sex,
                civilStatus: formState.civilStatus,
                citizenship: formState.citizenship,
                height: formState.height,
                weight: formState.weight,
                bloodType: formState.bloodType,
                gsisIdNo: formState.gsisIdNo,
                philsysNo: formState.philsysNo,
                pagibigIdNo: formState.pagibigIdNo,
                philhealthNo: formState.philhealthNo,
                citizenshipDetails: formState.citizenship === "Dual Citizenship" ? dualCitizenshipDetails : "",
                sssNo: formState.sssNo,
                tinNo: formState.tinNo,
                agencyEmployeeNo: formState.agencyEmployeeNo,
                spouseName: [formState.spouseFirstName, formState.spouseMiddleName, formState.spouseSurname].filter(Boolean).join(" "),
                spouseSurname: formState.spouseSurname,
                spouseFirstName: formState.spouseFirstName,
                spouseMiddleName: formState.spouseMiddleName,
                spouseNameExtension: formState.spouseNameExtension,
                spouseOccupation: formState.spouseOccupation,
                spouseEmployerBusinessName: formState.spouseEmployerBusinessName,
                spouseBusinessAddress: formState.spouseBusinessAddress,
                spouseTelephoneNo: formState.spouseTelephoneNo,
                childrenInfo,
                fatherName: [formState.fatherFirstName, formState.fatherMiddleName, formState.fatherSurname].filter(Boolean).join(" "),
                fatherSurname: formState.fatherSurname,
                fatherFirstName: formState.fatherFirstName,
                fatherMiddleName: formState.fatherMiddleName,
                fatherNameExtension: formState.fatherNameExtension,
                motherName: [formState.motherFirstName, formState.motherMiddleName, formState.motherSurname].filter(Boolean).join(" "),
                motherSurname: formState.motherSurname,
                motherFirstName: formState.motherFirstName,
                motherMiddleName: formState.motherMiddleName,
                civilServiceEligibility,
                voluntaryWork,
                trainings,
                otherInfo,
                referencesInfo: formState.referencesInfo,
                educationalBackground,
                workExperience
              });
            }}>
              <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Section {createSectionIndex + 1} of {createSectionIds.length}: {createSectionTitles[createSectionIndex]}</span>
              </div>
              <div id="create-section-1" className={createSectionIndex === 0 ? "space-y-2" : "hidden"}>
                <div className="space-y-2">
                  <Label>Full Name</Label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Input
                    placeholder="First Name"
                    value={nameParts.firstName}
                    onChange={(e) => setNameParts((prev) => ({ ...prev, firstName: e.target.value }))}
                    required
                  />
                  <Input
                    placeholder="Middle Name"
                    value={nameParts.middleName}
                    onChange={(e) => setNameParts((prev) => ({ ...prev, middleName: e.target.value }))}
                  />
                  <Input
                    placeholder="Surname"
                    value={nameParts.lastName}
                    onChange={(e) => setNameParts((prev) => ({ ...prev, lastName: e.target.value }))}
                    required
                  />
                  <Input
                    placeholder="Name Extension (JR/SR)"
                    value={nameParts.extensionName}
                    onChange={(e) => setNameParts((prev) => ({ ...prev, extensionName: e.target.value }))}
                  />
                </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mobile No.</Label>
                  <Input
                    placeholder="09XXXXXXXXX"
                    inputMode="numeric"
                    maxLength={11}
                    value={formState.contactNumber}
                    onChange={(e) => setFormState((prev) => ({ ...prev, contactNumber: e.target.value.replace(/[^0-9]/g, "") }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail Address (if any)</Label>
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={formState.email}
                    onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Telephone No.</Label>
                  <Input
                    placeholder="(Optional landline)"
                    inputMode="numeric"
                    maxLength={11}
                    value={formState.telephoneNumber}
                    onChange={(e) => setFormState((prev) => ({ ...prev, telephoneNumber: e.target.value.replace(/[^0-9]/g, "") }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Place of Birth</Label>
                  <Input
                    placeholder="City / Municipality"
                    value={formState.placeOfBirth}
                    onChange={(e) => setFormState((prev) => ({ ...prev, placeOfBirth: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Permanent Address</Label>
                <Input
                  placeholder="Permanent Address"
                  value={formState.permanentAddress}
                  onChange={(e) => setFormState((prev) => ({ ...prev, permanentAddress: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={formState.dateOfBirth}
                    onChange={(e) => setFormState((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sex at Birth</Label>
                  <Select value={formState.sex || undefined} onValueChange={(value) => setFormState((prev) => ({ ...prev, sex: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select sex" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Civil Status</Label>
                  <Select value={formState.civilStatus || undefined} onValueChange={(value) => setFormState((prev) => ({ ...prev, civilStatus: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select civil status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Single">Single</SelectItem>
                      <SelectItem value="Married">Married</SelectItem>
                      <SelectItem value="Widowed">Widowed</SelectItem>
                      <SelectItem value="Separated">Separated</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Citizenship</Label>
                  <div className="space-y-3 rounded-md border border-border/60 px-3 py-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="citizenship"
                        checked={formState.citizenship === "Filipino"}
                        onChange={() => {
                          setDualCitizenshipType("");
                          setFormState((prev) => ({ ...prev, citizenship: "Filipino", citizenshipDetails: "" }));
                        }}
                      />
                      Filipino
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="citizenship"
                        checked={formState.citizenship === "Dual Citizenship"}
                        onChange={() => setFormState((prev) => ({ ...prev, citizenship: "Dual Citizenship" }))}
                      />
                      Dual Citizenship
                    </label>

                    {formState.citizenship === "Dual Citizenship" ? (
                      <div className="space-y-2 rounded-md border border-border/60 px-3 py-2">
                        <Label>Dual Citizenship Type</Label>
                        <div className="flex flex-wrap items-center gap-4">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="dual-citizenship-type"
                              checked={dualCitizenshipType === "By Birth"}
                              onChange={() => setDualCitizenshipType("By Birth")}
                            />
                            By Birth
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="dual-citizenship-type"
                              checked={dualCitizenshipType === "By Naturalization"}
                              onChange={() => setDualCitizenshipType("By Naturalization")}
                            />
                            By Naturalization
                          </label>
                        </div>
                        {dualCitizenshipType ? (
                          <Input
                            placeholder="Enter country or legal basis"
                            value={formState.citizenshipDetails}
                            onChange={(e) => setFormState((prev) => ({ ...prev, citizenshipDetails: e.target.value }))}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Height (m)</Label>
                  <Input
                    placeholder="e.g. 1.57 m"
                    value={formState.height}
                    onChange={(e) => setFormState((prev) => ({ ...prev, height: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Weight (kg)</Label>
                  <Input
                    placeholder="e.g. 48 kg"
                    value={formState.weight}
                    onChange={(e) => setFormState((prev) => ({ ...prev, weight: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Blood Type</Label>
                  <Input
                    placeholder="A+, B+, O-, etc."
                    value={formState.bloodType}
                    onChange={(e) => setFormState((prev) => ({ ...prev, bloodType: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>UMID ID No.</Label>
                  <Input
                    placeholder="UMID number"
                    value={formState.gsisIdNo}
                    onChange={(e) => setFormState((prev) => ({ ...prev, gsisIdNo: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>PAG-IBIG ID No.</Label>
                  <Input
                    placeholder="PAG-IBIG number"
                    value={formState.pagibigIdNo}
                    onChange={(e) => setFormState((prev) => ({ ...prev, pagibigIdNo: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>PhilHealth No.</Label>
                  <Input
                    placeholder="PhilHealth number"
                    value={formState.philhealthNo}
                    onChange={(e) => setFormState((prev) => ({ ...prev, philhealthNo: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>PhilSys Number (PSN)</Label>
                  <Input
                    placeholder="PhilSys number"
                    value={formState.philsysNo}
                    onChange={(e) => setFormState((prev) => ({ ...prev, philsysNo: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>TIN No.</Label>
                  <Input
                    placeholder="TIN number"
                    value={formState.tinNo}
                    onChange={(e) => setFormState((prev) => ({ ...prev, tinNo: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Agency Employee No.</Label>
                  <Input
                    placeholder="Agency employee number"
                    value={formState.agencyEmployeeNo}
                    onChange={(e) => setFormState((prev) => ({ ...prev, agencyEmployeeNo: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2 rounded-md border border-border/60 p-3">
                <Label>Residential Address</Label>
                <div className="relative">
                  <Input
                    placeholder="Type residential address"
                    value={formState.address}
                    onChange={(e) => setFormState((prev) => ({ ...prev, address: e.target.value }))}
                    autoComplete="off"
                  />
                  {filteredAddressSuggestions.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border/60 bg-popover shadow-lg">
                      {filteredAddressSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={() => setFormState((prev) => ({ ...prev, address: suggestion }))}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              </div>
              <div id="create-section-2" className={createSectionIndex === 1 ? "space-y-2" : "hidden"}>
                <Label>II. Family Background</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <Label>Spouse Name</Label>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Input placeholder="Surname" value={formState.spouseSurname} onChange={(e) => setFormState((prev) => ({ ...prev, spouseSurname: e.target.value }))} />
                    <Input placeholder="First Name" value={formState.spouseFirstName} onChange={(e) => setFormState((prev) => ({ ...prev, spouseFirstName: e.target.value }))} />
                    <Input placeholder="Middle Name" value={formState.spouseMiddleName} onChange={(e) => setFormState((prev) => ({ ...prev, spouseMiddleName: e.target.value }))} />
                    <Input placeholder="Name Extension (JR, SR)" value={formState.spouseNameExtension} onChange={(e) => setFormState((prev) => ({ ...prev, spouseNameExtension: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input placeholder="Occupation" value={formState.spouseOccupation} onChange={(e) => setFormState((prev) => ({ ...prev, spouseOccupation: e.target.value }))} />
                    <Input placeholder="Employer / Business Name" value={formState.spouseEmployerBusinessName} onChange={(e) => setFormState((prev) => ({ ...prev, spouseEmployerBusinessName: e.target.value }))} />
                    <Input placeholder="Business Address" value={formState.spouseBusinessAddress} onChange={(e) => setFormState((prev) => ({ ...prev, spouseBusinessAddress: e.target.value }))} />
                    <Input
                      placeholder="Telephone No."
                      inputMode="numeric"
                      maxLength={11}
                      value={formState.spouseTelephoneNo}
                      onChange={(e) => setFormState((prev) => ({ ...prev, spouseTelephoneNo: e.target.value.replace(/[^0-9]/g, "") }))}
                    />
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <Label>Father's Name</Label>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Input placeholder="Surname" value={formState.fatherSurname} onChange={(e) => setFormState((prev) => ({ ...prev, fatherSurname: e.target.value }))} />
                    <Input placeholder="First Name" value={formState.fatherFirstName} onChange={(e) => setFormState((prev) => ({ ...prev, fatherFirstName: e.target.value }))} />
                    <Input placeholder="Middle Name" value={formState.fatherMiddleName} onChange={(e) => setFormState((prev) => ({ ...prev, fatherMiddleName: e.target.value }))} />
                    <Input placeholder="Name Extension (JR, SR)" value={formState.fatherNameExtension} onChange={(e) => setFormState((prev) => ({ ...prev, fatherNameExtension: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <Label>Mother's Maiden Name</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input placeholder="Surname" value={formState.motherSurname} onChange={(e) => setFormState((prev) => ({ ...prev, motherSurname: e.target.value }))} />
                    <Input placeholder="First Name" value={formState.motherFirstName} onChange={(e) => setFormState((prev) => ({ ...prev, motherFirstName: e.target.value }))} />
                    <Input placeholder="Middle Name" value={formState.motherMiddleName} onChange={(e) => setFormState((prev) => ({ ...prev, motherMiddleName: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Name of Children</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setChildrenEntries((prev) => [...prev, { fullName: "", dateOfBirth: "" }])}
                    >
                      Add Child
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {childrenEntries.map((entry, index) => (
                      <div key={`child-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-2 items-center">
                        <Input
                          placeholder="Child Full Name"
                          value={entry.fullName}
                          onChange={(e) =>
                            setChildrenEntries((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, fullName: e.target.value } : item
                              )
                            )
                          }
                        />
                        <Input
                          type="date"
                          value={entry.dateOfBirth}
                          onChange={(e) =>
                            setChildrenEntries((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, dateOfBirth: e.target.value } : item
                              )
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={childrenEntries.length === 1}
                          onClick={() =>
                            setChildrenEntries((prev) =>
                              prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div id="create-section-3" className={createSectionIndex === 2 ? "space-y-3" : "hidden"}>
                <Label>III. Educational Background</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Educational Records</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEducationEntries((prev) => [...prev, createEducationEntry()])}
                    >
                      Add Education Row
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {educationEntries.map((entry, index) => (
                      <div key={`education-${index}`} className="space-y-2 rounded-md border border-border/60 p-3">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Level</Label>
                            <Input
                              value={entry.level}
                              onChange={(e) =>
                                setEducationEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, level: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Name of School</Label>
                            <Input
                              value={entry.schoolName}
                              onChange={(e) =>
                                setEducationEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, schoolName: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Basic Education / Degree / Course</Label>
                            <Input
                              value={entry.degreeCourse}
                              onChange={(e) =>
                                setEducationEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, degreeCourse: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Highest Level / Units Earned</Label>
                            <Input
                              value={entry.highestLevelUnitsEarned}
                              onChange={(e) =>
                                setEducationEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, highestLevelUnitsEarned: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Period of Attendance From</Label>
                            <Select
                              value={entry.attendanceFrom || undefined}
                              onValueChange={(value) =>
                                setEducationEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, attendanceFrom: value } : item
                                  )
                                )
                              }
                            >
                              <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                              <SelectContent>
                                {yearOptions.map((year) => (
                                  <SelectItem key={`from-${index}-${year}`} value={year}>{year}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Period of Attendance To</Label>
                            <Select
                              value={entry.attendanceTo || undefined}
                              onValueChange={(value) =>
                                setEducationEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, attendanceTo: value } : item
                                  )
                                )
                              }
                            >
                              <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                              <SelectContent>
                                {yearOptions.map((year) => (
                                  <SelectItem key={`to-${index}-${year}`} value={year}>{year}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Year Graduated</Label>
                            <Select
                              value={entry.yearGraduated || undefined}
                              onValueChange={(value) =>
                                setEducationEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, yearGraduated: value } : item
                                  )
                                )
                              }
                            >
                              <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                              <SelectContent>
                                {yearOptions.map((year) => (
                                  <SelectItem key={`grad-${index}-${year}`} value={year}>{year}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Scholarship / Academic Honors</Label>
                            <Input
                              value={entry.scholarshipHonors}
                              onChange={(e) =>
                                setEducationEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, scholarshipHonors: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={educationEntries.length === 1}
                            onClick={() =>
                              setEducationEntries((prev) =>
                                prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)
                              )
                            }
                          >
                            Remove Row
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div id="create-section-4" className={createSectionIndex === 3 ? "space-y-2" : "hidden"}>
              <div className="space-y-2">
                <Label>IV. Civil Service Eligibility</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Eligibility Records</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCivilServiceEntries((prev) => [...prev, createCivilServiceEntry()])}
                    >
                      Add Eligibility Row
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {civilServiceEntries.map((entry, index) => (
                      <div key={`civil-service-${index}`} className="space-y-2 rounded-md border border-border/60 p-3">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Career Service / RA 1080 / Eligibility</Label>
                            <Input
                              value={entry.eligibility}
                              onChange={(e) =>
                                setCivilServiceEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, eligibility: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Rating (if applicable)</Label>
                            <Input
                              value={entry.rating}
                              onChange={(e) =>
                                setCivilServiceEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, rating: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Date of Examination / Confinement</Label>
                            <Input
                              type="date"
                              value={entry.examDate}
                              onChange={(e) =>
                                setCivilServiceEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, examDate: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Place of Examination / Confinement</Label>
                            <Input
                              value={entry.examPlace}
                              onChange={(e) =>
                                setCivilServiceEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, examPlace: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">License Number</Label>
                            <Input
                              value={entry.licenseNumber}
                              onChange={(e) =>
                                setCivilServiceEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, licenseNumber: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Date of Validity</Label>
                            <Input
                              type="date"
                              value={entry.licenseValidUntil}
                              onChange={(e) =>
                                setCivilServiceEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, licenseValidUntil: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={civilServiceEntries.length === 1}
                            onClick={() =>
                              setCivilServiceEntries((prev) =>
                                prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)
                              )
                            }
                          >
                            Remove Row
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>

              <div id="create-section-5" className={createSectionIndex === 4 ? "space-y-2" : "hidden"}>
              <div className="space-y-2">
                <Label>V. Work Experience</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Work Experience Records</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWorkExperienceEntries((prev) => [...prev, createWorkExperienceEntry()])}
                    >
                      Add Work Row
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {workExperienceEntries.map((entry, index) => (
                      <div key={`work-experience-${index}`} className="space-y-2 rounded-md border border-border/60 p-3">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Inclusive Dates From</Label>
                            <Input
                              type="date"
                              value={entry.dateFrom}
                              onChange={(e) =>
                                setWorkExperienceEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, dateFrom: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Inclusive Dates To</Label>
                            <Input
                              type="date"
                              value={entry.dateTo}
                              onChange={(e) =>
                                setWorkExperienceEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, dateTo: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Position Title</Label>
                            <Input
                              value={entry.positionTitle}
                              onChange={(e) =>
                                setWorkExperienceEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, positionTitle: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Department / Agency / Office / Company</Label>
                            <Input
                              value={entry.departmentAgencyOfficeCompany}
                              onChange={(e) =>
                                setWorkExperienceEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, departmentAgencyOfficeCompany: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Status of Appointment</Label>
                            <Input
                              value={entry.statusOfAppointment}
                              onChange={(e) =>
                                setWorkExperienceEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, statusOfAppointment: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="rounded-md border border-border/60 px-3 py-2">
                            <Label className="text-xs text-muted-foreground">Gov't Service (Y/N)</Label>
                            <div className="mt-2 flex items-center gap-4">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="radio"
                                  name={`govt-service-${index}`}
                                  checked={entry.isGovtService === "Y"}
                                  onChange={() =>
                                    setWorkExperienceEntries((prev) =>
                                      prev.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, isGovtService: "Y" } : item
                                      )
                                    )
                                  }
                                />
                                Yes
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="radio"
                                  name={`govt-service-${index}`}
                                  checked={entry.isGovtService === "N"}
                                  onChange={() =>
                                    setWorkExperienceEntries((prev) =>
                                      prev.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, isGovtService: "N" } : item
                                      )
                                    )
                                  }
                                />
                                No
                              </label>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={workExperienceEntries.length === 1}
                            onClick={() =>
                              setWorkExperienceEntries((prev) =>
                                prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)
                              )
                            }
                          >
                            Remove Row
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>

              <div id="create-section-6" className={createSectionIndex === 5 ? "space-y-2" : "hidden"}>
              <div className="space-y-2">
                <Label>VI. Voluntary Work or Involvement in Civic/Non-Government/People/Voluntary Organizations</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Voluntary Work Records</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVoluntaryWorkEntries((prev) => [...prev, createVoluntaryWorkEntry()])}
                    >
                      Add Voluntary Work Row
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {voluntaryWorkEntries.map((entry, index) => (
                      <div key={`voluntary-work-${index}`} className="space-y-2 rounded-md border border-border/60 p-3">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Name and Address of Organization</Label>
                            <Input
                              value={entry.organizationNameAddress}
                              onChange={(e) =>
                                setVoluntaryWorkEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, organizationNameAddress: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Number of Hours</Label>
                            <Input
                              type="number"
                              min={0}
                              value={entry.numberOfHours}
                              onChange={(e) =>
                                setVoluntaryWorkEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, numberOfHours: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Inclusive Dates From</Label>
                            <Input
                              type="date"
                              value={entry.dateFrom}
                              onChange={(e) =>
                                setVoluntaryWorkEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, dateFrom: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Inclusive Dates To</Label>
                            <Input
                              type="date"
                              value={entry.dateTo}
                              onChange={(e) =>
                                setVoluntaryWorkEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, dateTo: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Position / Nature of Work</Label>
                            <Input
                              value={entry.positionNatureOfWork}
                              onChange={(e) =>
                                setVoluntaryWorkEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, positionNatureOfWork: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={voluntaryWorkEntries.length === 1}
                            onClick={() =>
                              setVoluntaryWorkEntries((prev) =>
                                prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)
                              )
                            }
                          >
                            Remove Row
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>

              <div id="create-section-7" className={createSectionIndex === 6 ? "space-y-2" : "hidden"}>
              <div className="space-y-2">
                <Label>VII. Learning and Development (L&D) Interventions/Training Programs Attended</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>L&D Records</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setTrainingEntries((prev) => [...prev, createTrainingEntry()])}
                    >
                      Add L&D Row
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {trainingEntries.map((entry, index) => (
                      <div key={`training-${index}`} className="space-y-2 rounded-md border border-border/60 p-3">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Title of Learning and Development Intervention/Training Program</Label>
                            <Input
                              value={entry.title}
                              onChange={(e) =>
                                setTrainingEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, title: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Inclusive Dates From</Label>
                            <Input
                              type="date"
                              value={entry.dateFrom}
                              onChange={(e) =>
                                setTrainingEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, dateFrom: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Inclusive Dates To</Label>
                            <Input
                              type="date"
                              value={entry.dateTo}
                              onChange={(e) =>
                                setTrainingEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, dateTo: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Number of Hours</Label>
                            <Input
                              type="number"
                              min={0}
                              value={entry.numberOfHours}
                              onChange={(e) =>
                                setTrainingEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, numberOfHours: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Type of L&D (Managerial / Supervisory / Technical)</Label>
                            <Input
                              value={entry.typeOfLd}
                              onChange={(e) =>
                                setTrainingEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, typeOfLd: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Conducted / Sponsored By</Label>
                            <Input
                              value={entry.conductedSponsoredBy}
                              onChange={(e) =>
                                setTrainingEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, conductedSponsoredBy: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={trainingEntries.length === 1}
                            onClick={() =>
                              setTrainingEntries((prev) =>
                                prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)
                              )
                            }
                          >
                            Remove Row
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>

              <div id="create-section-8" className={createSectionIndex === 7 ? "space-y-2" : "hidden"}>
              <div className="space-y-2">
                <Label>VIII. Other Information</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Other Information Records</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setOtherInfoEntries((prev) => [...prev, createOtherInfoEntry()])}
                    >
                      Add Other Info Row
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {otherInfoEntries.map((entry, index) => (
                      <div key={`other-info-${index}`} className="space-y-2 rounded-md border border-border/60 p-3">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Special Skills and Hobbies</Label>
                            <Input
                              value={entry.specialSkillsHobbies}
                              onChange={(e) =>
                                setOtherInfoEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, specialSkillsHobbies: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Non-Academic Distinctions / Recognition</Label>
                            <Input
                              value={entry.nonAcademicDistinctionsRecognition}
                              onChange={(e) =>
                                setOtherInfoEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, nonAcademicDistinctionsRecognition: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Membership in Association/Organization</Label>
                            <Input
                              value={entry.membershipsAssociationOrganization}
                              onChange={(e) =>
                                setOtherInfoEntries((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, membershipsAssociationOrganization: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={otherInfoEntries.length === 1}
                            onClick={() =>
                              setOtherInfoEntries((prev) =>
                                prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)
                              )
                            }
                          >
                            Remove Row
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Upload Documents</Label>
                <div className="space-y-3">
                  {/* PDS */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground"><span className="text-red-500">*</span> Upload PDS</span>
                    <input
                      id="resume"
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setDocuments((prev) => ({ ...prev, resume: file }));
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="resume"
                      className={`flex items-center justify-between gap-2 rounded-lg border-2 border-dashed px-3 py-4 text-sm transition-colors cursor-pointer ${
                        documents.resume
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-border bg-muted/40 text-muted-foreground hover:border-primary/60 hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {documents.resume ? (
                          <Check className="w-5 h-5 text-green-600" />
                        ) : (
                          <Upload className="w-5 h-5" />
                        )}
                        <span>{documents.resume ? documents.resume.name : "Click to upload or drag file"}</span>
                      </div>
                    </label>
                  </div>

                  {/* Transcript */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground"><span className="text-red-500">*</span> Upload Transcript</span>
                    <input
                      id="transcript"
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setDocuments((prev) => ({ ...prev, transcript: file }));
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="transcript"
                      className={`flex items-center justify-between gap-2 rounded-lg border-2 border-dashed px-3 py-4 text-sm transition-colors cursor-pointer ${
                        documents.transcript
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-border bg-muted/40 text-muted-foreground hover:border-primary/60 hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {documents.transcript ? (
                          <Check className="w-5 h-5 text-green-600" />
                        ) : (
                          <Upload className="w-5 h-5" />
                        )}
                        <span>{documents.transcript ? documents.transcript.name : "Click to upload or drag file"}</span>
                      </div>
                    </label>
                  </div>

                  {/* Certificates */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground"><span className="text-red-500">*</span> Upload Certificates</span>
                      {documents.certificates.length > 0 && (
                        <span className="text-xs text-muted-foreground">({documents.certificates.length} file{documents.certificates.length !== 1 ? "s" : ""})</span>
                      )}
                    </div>
                    <input
                      id="certificate"
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        if (file) {
                          setDocuments((prev) => ({ ...prev, certificates: [...prev.certificates, file] }));
                          // Reset input so same file can be selected again
                          e.target.value = "";
                        }
                      }}
                      className="hidden"
                    />
                    {documents.certificates.length > 0 && (
                      <div className="space-y-2">
                        {documents.certificates.map((cert, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 rounded-lg border border-green-500 bg-green-50 px-3 py-2 text-sm text-green-700">
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-green-600" />
                              <span className="truncate">{cert.name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setDocuments((prev) => ({
                                  ...prev,
                                  certificates: prev.certificates.filter((_, i) => i !== idx)
                                }));
                              }}
                              className="text-green-600 hover:text-green-800 font-medium text-xs"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <label
                      htmlFor="certificate"
                      className="flex items-center justify-between gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground hover:border-primary/60 hover:text-foreground transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Upload className="w-5 h-5" />
                        <span>Click to upload or drag files</span>
                      </div>
                    </label>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Supported formats: PDF, DOCX, DOC, JPG, PNG</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={handleScanResumeAutofill}
                  disabled={!documents.resume || isScanningResume}
                >
                  {isScanningResume ? "Scanning PDS..." : "Scan PDS & Autofill Fields"}
                </Button>
              </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    resetCreateForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviousCreateSection}
                  disabled={createSectionIndex === 0}
                >
                  Previous Section
                </Button>
                {createSectionIndex < createSectionIds.length - 1 ? (
                  <Button type="button" onClick={handleNextCreateSection}>Next Section</Button>
                ) : (
                  <Button type="submit" disabled={createMutation.isPending}>Save Applicant</Button>
                )}
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={showEdit} onOpenChange={(open) => {
          if (!open) {
            setShowEdit(false);
            setEditingApplicantId(null);
            setEditSectionIndex(0);
            setEditDocuments({ resume: null, transcript: null, certificates: [] });
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Applicant</DialogTitle></DialogHeader>
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault();
              if (editSectionIndex < createSectionIds.length - 1) {
                setEditSectionIndex((prev) => Math.min(createSectionIds.length - 1, prev + 1));
                return;
              }
              if (!editingApplicantId) return;
              const editCitizenshipDetails = editFormState.citizenship === "Dual Citizenship" && editDualCitizenshipType
                ? `${editDualCitizenshipType}: ${editFormState.citizenshipDetails.trim()}`
                : editFormState.citizenship === "Dual Citizenship"
                ? editFormState.citizenshipDetails
                : "";
              const fullName = formatFullName(editNameParts);
              updateMutation.mutate({
                id: editingApplicantId,
                payload: {
                  ...editFormState,
                  fullName,
                  citizenshipDetails: editCitizenshipDetails,
                  childrenInfo: serializeChildrenInfo(editChildrenEntries),
                  educationalBackground: serializeEducationalBackground(editEducationEntries),
                  civilServiceEligibility: serializeCivilServiceEligibility(editCivilServiceEntries),
                  workExperience: serializeWorkExperience(editWorkExperienceEntries),
                  voluntaryWork: serializeVoluntaryWork(editVoluntaryWorkEntries),
                  trainings: serializeTrainings(editTrainingEntries),
                  otherInfo: serializeOtherInfo(editOtherInfoEntries),
                  spouseName: [editFormState.spouseFirstName, editFormState.spouseMiddleName, editFormState.spouseSurname].filter(Boolean).join(" "),
                  fatherName: [editFormState.fatherFirstName, editFormState.fatherMiddleName, editFormState.fatherSurname].filter(Boolean).join(" "),
                  motherName: [editFormState.motherFirstName, editFormState.motherMiddleName, editFormState.motherSurname].filter(Boolean).join(" ")
                }
              });
            }}>
              <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Section {editSectionIndex + 1} of {createSectionIds.length}: {createSectionTitles[editSectionIndex]}</span>
              </div>

              {/* ── SECTION 1: Personal Information ── */}
              <div className={editSectionIndex === 0 ? "space-y-3" : "hidden"}>
                <div className="space-y-2"><Label>Full Name</Label></div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Input placeholder="First Name" value={editNameParts.firstName} onChange={(e) => setEditNameParts((prev) => ({ ...prev, firstName: e.target.value }))} required />
                  <Input placeholder="Middle Name" value={editNameParts.middleName} onChange={(e) => setEditNameParts((prev) => ({ ...prev, middleName: e.target.value }))} />
                  <Input placeholder="Surname" value={editNameParts.lastName} onChange={(e) => setEditNameParts((prev) => ({ ...prev, lastName: e.target.value }))} required />
                  <Input placeholder="Name Extension (JR/SR)" value={editNameParts.extensionName} onChange={(e) => setEditNameParts((prev) => ({ ...prev, extensionName: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Mobile No.</Label>
                    <Input placeholder="09XXXXXXXXX" inputMode="numeric" maxLength={11} value={editFormState.contactNumber} onChange={(e) => setEditFormState((prev) => ({ ...prev, contactNumber: e.target.value.replace(/[^0-9]/g, "") }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail Address (if any)</Label>
                    <Input type="email" placeholder="email@example.com" value={editFormState.email} onChange={(e) => setEditFormState((prev) => ({ ...prev, email: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Telephone No.</Label>
                    <Input placeholder="(Optional landline)" inputMode="numeric" maxLength={11} value={editFormState.telephoneNumber} onChange={(e) => setEditFormState((prev) => ({ ...prev, telephoneNumber: e.target.value.replace(/[^0-9]/g, "") }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Place of Birth</Label>
                    <Input placeholder="City / Municipality" value={editFormState.placeOfBirth} onChange={(e) => setEditFormState((prev) => ({ ...prev, placeOfBirth: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Residential Address</Label>
                  <Input placeholder="Full residential address" value={editFormState.address} onChange={(e) => setEditFormState((prev) => ({ ...prev, address: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Permanent Address</Label>
                  <Input placeholder="Permanent Address" value={editFormState.permanentAddress} onChange={(e) => setEditFormState((prev) => ({ ...prev, permanentAddress: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date of Birth</Label>
                    <Input type="date" value={editFormState.dateOfBirth} onChange={(e) => setEditFormState((prev) => ({ ...prev, dateOfBirth: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Sex at Birth</Label>
                    <Select value={editFormState.sex || undefined} onValueChange={(value) => setEditFormState((prev) => ({ ...prev, sex: value }))}>
                      <SelectTrigger><SelectValue placeholder="Select sex" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Civil Status</Label>
                    <Select value={editFormState.civilStatus || undefined} onValueChange={(value) => setEditFormState((prev) => ({ ...prev, civilStatus: value }))}>
                      <SelectTrigger><SelectValue placeholder="Select civil status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Single">Single</SelectItem>
                        <SelectItem value="Married">Married</SelectItem>
                        <SelectItem value="Widowed">Widowed</SelectItem>
                        <SelectItem value="Separated">Separated</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Citizenship</Label>
                    <div className="space-y-3 rounded-md border border-border/60 px-3 py-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="edit-citizenship" checked={editFormState.citizenship === "Filipino"} onChange={() => { setEditDualCitizenshipType(""); setEditFormState((prev) => ({ ...prev, citizenship: "Filipino", citizenshipDetails: "" })); }} />
                        Filipino
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="edit-citizenship" checked={editFormState.citizenship === "Dual Citizenship"} onChange={() => setEditFormState((prev) => ({ ...prev, citizenship: "Dual Citizenship" }))} />
                        Dual Citizenship
                      </label>
                      {editFormState.citizenship === "Dual Citizenship" ? (
                        <div className="space-y-2 rounded-md border border-border/60 px-3 py-2">
                          <Label>Dual Citizenship Type</Label>
                          <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-sm">
                              <input type="radio" name="edit-dual-citizenship-type" checked={editDualCitizenshipType === "By Birth"} onChange={() => setEditDualCitizenshipType("By Birth")} />
                              By Birth
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input type="radio" name="edit-dual-citizenship-type" checked={editDualCitizenshipType === "By Naturalization"} onChange={() => setEditDualCitizenshipType("By Naturalization")} />
                              By Naturalization
                            </label>
                          </div>
                          {editDualCitizenshipType ? (
                            <Input placeholder="Enter country or legal basis" value={editFormState.citizenshipDetails} onChange={(e) => setEditFormState((prev) => ({ ...prev, citizenshipDetails: e.target.value }))} />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Height (m)</Label><Input placeholder="e.g. 1.57 m" value={editFormState.height} onChange={(e) => setEditFormState((prev) => ({ ...prev, height: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Weight (kg)</Label><Input placeholder="e.g. 48 kg" value={editFormState.weight} onChange={(e) => setEditFormState((prev) => ({ ...prev, weight: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Blood Type</Label><Input placeholder="A+, B+, O-, etc." value={editFormState.bloodType} onChange={(e) => setEditFormState((prev) => ({ ...prev, bloodType: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>UMID ID No.</Label><Input placeholder="UMID number" value={editFormState.gsisIdNo} onChange={(e) => setEditFormState((prev) => ({ ...prev, gsisIdNo: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>PAG-IBIG ID No.</Label><Input placeholder="PAG-IBIG number" value={editFormState.pagibigIdNo} onChange={(e) => setEditFormState((prev) => ({ ...prev, pagibigIdNo: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>PhilHealth No.</Label><Input placeholder="PhilHealth number" value={editFormState.philhealthNo} onChange={(e) => setEditFormState((prev) => ({ ...prev, philhealthNo: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>PhilSys Number (PSN)</Label><Input placeholder="PhilSys number" value={editFormState.philsysNo} onChange={(e) => setEditFormState((prev) => ({ ...prev, philsysNo: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>TIN No.</Label><Input placeholder="TIN number" value={editFormState.tinNo} onChange={(e) => setEditFormState((prev) => ({ ...prev, tinNo: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Agency Employee No.</Label><Input placeholder="Agency employee number" value={editFormState.agencyEmployeeNo} onChange={(e) => setEditFormState((prev) => ({ ...prev, agencyEmployeeNo: e.target.value }))} /></div>
                </div>
              </div>

              {/* ── SECTION 2: Family Background ── */}
              <div className={editSectionIndex === 1 ? "space-y-2" : "hidden"}>
                <Label>II. Family Background</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <Label>Spouse Name</Label>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Input placeholder="Surname" value={editFormState.spouseSurname} onChange={(e) => setEditFormState((prev) => ({ ...prev, spouseSurname: e.target.value }))} />
                    <Input placeholder="First Name" value={editFormState.spouseFirstName} onChange={(e) => setEditFormState((prev) => ({ ...prev, spouseFirstName: e.target.value }))} />
                    <Input placeholder="Middle Name" value={editFormState.spouseMiddleName} onChange={(e) => setEditFormState((prev) => ({ ...prev, spouseMiddleName: e.target.value }))} />
                    <Input placeholder="Name Extension (JR, SR)" value={editFormState.spouseNameExtension} onChange={(e) => setEditFormState((prev) => ({ ...prev, spouseNameExtension: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input placeholder="Occupation" value={editFormState.spouseOccupation} onChange={(e) => setEditFormState((prev) => ({ ...prev, spouseOccupation: e.target.value }))} />
                    <Input placeholder="Employer / Business Name" value={editFormState.spouseEmployerBusinessName} onChange={(e) => setEditFormState((prev) => ({ ...prev, spouseEmployerBusinessName: e.target.value }))} />
                    <Input placeholder="Business Address" value={editFormState.spouseBusinessAddress} onChange={(e) => setEditFormState((prev) => ({ ...prev, spouseBusinessAddress: e.target.value }))} />
                    <Input placeholder="Telephone No." inputMode="numeric" maxLength={11} value={editFormState.spouseTelephoneNo} onChange={(e) => setEditFormState((prev) => ({ ...prev, spouseTelephoneNo: e.target.value.replace(/[^0-9]/g, "") }))} />
                  </div>
                </div>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <Label>Father's Name</Label>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Input placeholder="Surname" value={editFormState.fatherSurname} onChange={(e) => setEditFormState((prev) => ({ ...prev, fatherSurname: e.target.value }))} />
                    <Input placeholder="First Name" value={editFormState.fatherFirstName} onChange={(e) => setEditFormState((prev) => ({ ...prev, fatherFirstName: e.target.value }))} />
                    <Input placeholder="Middle Name" value={editFormState.fatherMiddleName} onChange={(e) => setEditFormState((prev) => ({ ...prev, fatherMiddleName: e.target.value }))} />
                    <Input placeholder="Name Extension (JR, SR)" value={editFormState.fatherNameExtension} onChange={(e) => setEditFormState((prev) => ({ ...prev, fatherNameExtension: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <Label>Mother's Maiden Name</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input placeholder="Surname" value={editFormState.motherSurname} onChange={(e) => setEditFormState((prev) => ({ ...prev, motherSurname: e.target.value }))} />
                    <Input placeholder="First Name" value={editFormState.motherFirstName} onChange={(e) => setEditFormState((prev) => ({ ...prev, motherFirstName: e.target.value }))} />
                    <Input placeholder="Middle Name" value={editFormState.motherMiddleName} onChange={(e) => setEditFormState((prev) => ({ ...prev, motherMiddleName: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Name of Children</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditChildrenEntries((prev) => [...prev, { fullName: "", dateOfBirth: "" }])}>Add Child</Button>
                  </div>
                  <div className="space-y-3">
                    {editChildrenEntries.map((entry, index) => (
                      <div key={`edit-child-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-2 items-center">
                        <Input placeholder="Child Full Name" value={entry.fullName} onChange={(e) => setEditChildrenEntries((prev) => prev.map((item, i) => i === index ? { ...item, fullName: e.target.value } : item))} />
                        <Input type="date" value={entry.dateOfBirth} onChange={(e) => setEditChildrenEntries((prev) => prev.map((item, i) => i === index ? { ...item, dateOfBirth: e.target.value } : item))} />
                        <Button type="button" variant="ghost" disabled={editChildrenEntries.length === 1} onClick={() => setEditChildrenEntries((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index))}>Remove</Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── SECTION 3: Educational Background ── */}
              <div className={editSectionIndex === 2 ? "space-y-3" : "hidden"}>
                <Label>III. Educational Background</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Educational Records</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditEducationEntries((prev) => [...prev, createEducationEntry()])}>Add Education Row</Button>
                  </div>
                  <div className="space-y-3">
                    {editEducationEntries.map((entry, index) => (
                      <div key={`edit-edu-${index}`} className="space-y-2 rounded-md border border-border/60 p-3">
                        <div className="space-y-3">
                          <div className="space-y-1"><Label className="text-xs font-medium">Level</Label><Input value={entry.level} onChange={(e) => setEditEducationEntries((prev) => prev.map((item, i) => i === index ? { ...item, level: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Name of School</Label><Input value={entry.schoolName} onChange={(e) => setEditEducationEntries((prev) => prev.map((item, i) => i === index ? { ...item, schoolName: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Basic Education / Degree / Course</Label><Input value={entry.degreeCourse} onChange={(e) => setEditEducationEntries((prev) => prev.map((item, i) => i === index ? { ...item, degreeCourse: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Highest Level / Units Earned</Label><Input value={entry.highestLevelUnitsEarned} onChange={(e) => setEditEducationEntries((prev) => prev.map((item, i) => i === index ? { ...item, highestLevelUnitsEarned: e.target.value } : item))} /></div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Period of Attendance From</Label>
                            <Select value={entry.attendanceFrom || undefined} onValueChange={(value) => setEditEducationEntries((prev) => prev.map((item, i) => i === index ? { ...item, attendanceFrom: value } : item))}>
                              <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                              <SelectContent>{yearOptions.map((year) => (<SelectItem key={`efrom-${index}-${year}`} value={year}>{year}</SelectItem>))}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Period of Attendance To</Label>
                            <Select value={entry.attendanceTo || undefined} onValueChange={(value) => setEditEducationEntries((prev) => prev.map((item, i) => i === index ? { ...item, attendanceTo: value } : item))}>
                              <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                              <SelectContent>{yearOptions.map((year) => (<SelectItem key={`eto-${index}-${year}`} value={year}>{year}</SelectItem>))}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Year Graduated</Label>
                            <Select value={entry.yearGraduated || undefined} onValueChange={(value) => setEditEducationEntries((prev) => prev.map((item, i) => i === index ? { ...item, yearGraduated: value } : item))}>
                              <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                              <SelectContent>{yearOptions.map((year) => (<SelectItem key={`egrad-${index}-${year}`} value={year}>{year}</SelectItem>))}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Scholarship / Academic Honors</Label><Input value={entry.scholarshipHonors} onChange={(e) => setEditEducationEntries((prev) => prev.map((item, i) => i === index ? { ...item, scholarshipHonors: e.target.value } : item))} /></div>
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" variant="ghost" disabled={editEducationEntries.length === 1} onClick={() => setEditEducationEntries((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index))}>Remove Row</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── SECTION 4: Civil Service Eligibility ── */}
              <div className={editSectionIndex === 3 ? "space-y-2" : "hidden"}>
                <Label>IV. Civil Service Eligibility</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Eligibility Records</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditCivilServiceEntries((prev) => [...prev, createCivilServiceEntry()])}>Add Eligibility Row</Button>
                  </div>
                  <div className="space-y-3">
                    {editCivilServiceEntries.map((entry, index) => (
                      <div key={`edit-cs-${index}`} className="space-y-2 rounded-md border border-border/60 p-3">
                        <div className="space-y-3">
                          <div className="space-y-1"><Label className="text-xs font-medium">Career Service / RA 1080 / Eligibility</Label><Input value={entry.eligibility} onChange={(e) => setEditCivilServiceEntries((prev) => prev.map((item, i) => i === index ? { ...item, eligibility: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Rating (if applicable)</Label><Input value={entry.rating} onChange={(e) => setEditCivilServiceEntries((prev) => prev.map((item, i) => i === index ? { ...item, rating: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Date of Examination / Confinement</Label><Input type="date" value={entry.examDate} onChange={(e) => setEditCivilServiceEntries((prev) => prev.map((item, i) => i === index ? { ...item, examDate: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Place of Examination / Confinement</Label><Input value={entry.examPlace} onChange={(e) => setEditCivilServiceEntries((prev) => prev.map((item, i) => i === index ? { ...item, examPlace: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">License Number</Label><Input value={entry.licenseNumber} onChange={(e) => setEditCivilServiceEntries((prev) => prev.map((item, i) => i === index ? { ...item, licenseNumber: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Date of Validity</Label><Input type="date" value={entry.licenseValidUntil} onChange={(e) => setEditCivilServiceEntries((prev) => prev.map((item, i) => i === index ? { ...item, licenseValidUntil: e.target.value } : item))} /></div>
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" variant="ghost" disabled={editCivilServiceEntries.length === 1} onClick={() => setEditCivilServiceEntries((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index))}>Remove Row</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── SECTION 5: Work Experience ── */}
              <div className={editSectionIndex === 4 ? "space-y-2" : "hidden"}>
                <Label>V. Work Experience</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Work Experience Records</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditWorkExperienceEntries((prev) => [...prev, createWorkExperienceEntry()])}>Add Work Row</Button>
                  </div>
                  <div className="space-y-3">
                    {editWorkExperienceEntries.map((entry, index) => (
                      <div key={`edit-we-${index}`} className="space-y-2 rounded-md border border-border/60 p-3">
                        <div className="space-y-3">
                          <div className="space-y-1"><Label className="text-xs font-medium">Inclusive Dates From</Label><Input type="date" value={entry.dateFrom} onChange={(e) => setEditWorkExperienceEntries((prev) => prev.map((item, i) => i === index ? { ...item, dateFrom: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Inclusive Dates To</Label><Input type="date" value={entry.dateTo} onChange={(e) => setEditWorkExperienceEntries((prev) => prev.map((item, i) => i === index ? { ...item, dateTo: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Position Title</Label><Input value={entry.positionTitle} onChange={(e) => setEditWorkExperienceEntries((prev) => prev.map((item, i) => i === index ? { ...item, positionTitle: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Department / Agency / Office / Company</Label><Input value={entry.departmentAgencyOfficeCompany} onChange={(e) => setEditWorkExperienceEntries((prev) => prev.map((item, i) => i === index ? { ...item, departmentAgencyOfficeCompany: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Status of Appointment</Label><Input value={entry.statusOfAppointment} onChange={(e) => setEditWorkExperienceEntries((prev) => prev.map((item, i) => i === index ? { ...item, statusOfAppointment: e.target.value } : item))} /></div>
                          <div className="rounded-md border border-border/60 px-3 py-2">
                            <Label className="text-xs text-muted-foreground">Gov't Service (Y/N)</Label>
                            <div className="mt-2 flex items-center gap-4">
                              <label className="flex items-center gap-2 text-sm"><input type="radio" name={`edit-govt-${index}`} checked={entry.isGovtService === "Y"} onChange={() => setEditWorkExperienceEntries((prev) => prev.map((item, i) => i === index ? { ...item, isGovtService: "Y" } : item))} />Yes</label>
                              <label className="flex items-center gap-2 text-sm"><input type="radio" name={`edit-govt-${index}`} checked={entry.isGovtService === "N"} onChange={() => setEditWorkExperienceEntries((prev) => prev.map((item, i) => i === index ? { ...item, isGovtService: "N" } : item))} />No</label>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" variant="ghost" disabled={editWorkExperienceEntries.length === 1} onClick={() => setEditWorkExperienceEntries((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index))}>Remove Row</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── SECTION 6: Voluntary Work ── */}
              <div className={editSectionIndex === 5 ? "space-y-2" : "hidden"}>
                <Label>VI. Voluntary Work or Involvement in Civic/Non-Government/People/Voluntary Organizations</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Voluntary Work Records</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditVoluntaryWorkEntries((prev) => [...prev, createVoluntaryWorkEntry()])}>Add Voluntary Work Row</Button>
                  </div>
                  <div className="space-y-3">
                    {editVoluntaryWorkEntries.map((entry, index) => (
                      <div key={`edit-vw-${index}`} className="space-y-2 rounded-md border border-border/60 p-3">
                        <div className="space-y-3">
                          <div className="space-y-1"><Label className="text-xs font-medium">Name and Address of Organization</Label><Input value={entry.organizationNameAddress} onChange={(e) => setEditVoluntaryWorkEntries((prev) => prev.map((item, i) => i === index ? { ...item, organizationNameAddress: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Number of Hours</Label><Input type="number" min={0} value={entry.numberOfHours} onChange={(e) => setEditVoluntaryWorkEntries((prev) => prev.map((item, i) => i === index ? { ...item, numberOfHours: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Inclusive Dates From</Label><Input type="date" value={entry.dateFrom} onChange={(e) => setEditVoluntaryWorkEntries((prev) => prev.map((item, i) => i === index ? { ...item, dateFrom: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Inclusive Dates To</Label><Input type="date" value={entry.dateTo} onChange={(e) => setEditVoluntaryWorkEntries((prev) => prev.map((item, i) => i === index ? { ...item, dateTo: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Position / Nature of Work</Label><Input value={entry.positionNatureOfWork} onChange={(e) => setEditVoluntaryWorkEntries((prev) => prev.map((item, i) => i === index ? { ...item, positionNatureOfWork: e.target.value } : item))} /></div>
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" variant="ghost" disabled={editVoluntaryWorkEntries.length === 1} onClick={() => setEditVoluntaryWorkEntries((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index))}>Remove Row</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── SECTION 7: L&D / Training ── */}
              <div className={editSectionIndex === 6 ? "space-y-2" : "hidden"}>
                <Label>VII. Learning and Development (L&D) Interventions/Training Programs Attended</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>L&D Records</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditTrainingEntries((prev) => [...prev, createTrainingEntry()])}>Add L&D Row</Button>
                  </div>
                  <div className="space-y-3">
                    {editTrainingEntries.map((entry, index) => (
                      <div key={`edit-tr-${index}`} className="space-y-2 rounded-md border border-border/60 p-3">
                        <div className="space-y-3">
                          <div className="space-y-1"><Label className="text-xs font-medium">Title of Learning and Development Intervention/Training Program</Label><Input value={entry.title} onChange={(e) => setEditTrainingEntries((prev) => prev.map((item, i) => i === index ? { ...item, title: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Inclusive Dates From</Label><Input type="date" value={entry.dateFrom} onChange={(e) => setEditTrainingEntries((prev) => prev.map((item, i) => i === index ? { ...item, dateFrom: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Inclusive Dates To</Label><Input type="date" value={entry.dateTo} onChange={(e) => setEditTrainingEntries((prev) => prev.map((item, i) => i === index ? { ...item, dateTo: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Number of Hours</Label><Input type="number" min={0} value={entry.numberOfHours} onChange={(e) => setEditTrainingEntries((prev) => prev.map((item, i) => i === index ? { ...item, numberOfHours: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Type of L&D (Managerial / Supervisory / Technical)</Label><Input value={entry.typeOfLd} onChange={(e) => setEditTrainingEntries((prev) => prev.map((item, i) => i === index ? { ...item, typeOfLd: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Conducted / Sponsored By</Label><Input value={entry.conductedSponsoredBy} onChange={(e) => setEditTrainingEntries((prev) => prev.map((item, i) => i === index ? { ...item, conductedSponsoredBy: e.target.value } : item))} /></div>
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" variant="ghost" disabled={editTrainingEntries.length === 1} onClick={() => setEditTrainingEntries((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index))}>Remove Row</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── SECTION 8: Other Information + Documents ── */}
              <div className={editSectionIndex === 7 ? "space-y-2" : "hidden"}>
                <Label>VIII. Other Information</Label>
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Other Information Records</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditOtherInfoEntries((prev) => [...prev, createOtherInfoEntry()])}>Add Other Info Row</Button>
                  </div>
                  <div className="space-y-3">
                    {editOtherInfoEntries.map((entry, index) => (
                      <div key={`edit-oi-${index}`} className="space-y-2 rounded-md border border-border/60 p-3">
                        <div className="space-y-3">
                          <div className="space-y-1"><Label className="text-xs font-medium">Special Skills and Hobbies</Label><Input value={entry.specialSkillsHobbies} onChange={(e) => setEditOtherInfoEntries((prev) => prev.map((item, i) => i === index ? { ...item, specialSkillsHobbies: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Non-Academic Distinctions / Recognition</Label><Input value={entry.nonAcademicDistinctionsRecognition} onChange={(e) => setEditOtherInfoEntries((prev) => prev.map((item, i) => i === index ? { ...item, nonAcademicDistinctionsRecognition: e.target.value } : item))} /></div>
                          <div className="space-y-1"><Label className="text-xs font-medium">Membership in Association/Organization</Label><Input value={entry.membershipsAssociationOrganization} onChange={(e) => setEditOtherInfoEntries((prev) => prev.map((item, i) => i === index ? { ...item, membershipsAssociationOrganization: e.target.value } : item))} /></div>
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" variant="ghost" disabled={editOtherInfoEntries.length === 1} onClick={() => setEditOtherInfoEntries((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index))}>Remove Row</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Existing Documents */}
                {editingApplicantDocuments.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-medium text-muted-foreground">Current Documents</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {editingApplicantDocuments.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="truncate">{doc.originalName}</span>
                            <span className="text-muted-foreground whitespace-nowrap">({doc.docType})</span>
                          </div>
                          <a href={getFileUrl(doc.url)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-medium text-xs shrink-0">View</a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload New Documents */}
                <div className="space-y-3 pt-2 border-t">
                  <Label>Upload Documents</Label>
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Upload PDS</span>
                    <input id="edit-resume" type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp" onChange={(e) => { const file = e.target.files?.[0] ?? null; setEditDocuments((prev) => ({ ...prev, resume: file })); e.target.value = ""; }} className="hidden" />
                    <label htmlFor="edit-resume" className={`flex items-center gap-2 rounded-lg border-2 border-dashed px-3 py-3 text-sm transition-colors cursor-pointer ${editDocuments.resume ? "border-green-500 bg-green-50 text-green-700" : "border-border bg-muted/40 text-muted-foreground hover:border-primary/60"}`}>
                      {editDocuments.resume ? <Check className="w-4 h-4 text-green-600" /> : <Upload className="w-4 h-4" />}
                      <span>{editDocuments.resume ? editDocuments.resume.name : "Click to upload or drag file"}</span>
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Upload Transcript</span>
                    <input id="edit-transcript" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => { const file = e.target.files?.[0] ?? null; setEditDocuments((prev) => ({ ...prev, transcript: file })); e.target.value = ""; }} className="hidden" />
                    <label htmlFor="edit-transcript" className={`flex items-center gap-2 rounded-lg border-2 border-dashed px-3 py-3 text-sm transition-colors cursor-pointer ${editDocuments.transcript ? "border-green-500 bg-green-50 text-green-700" : "border-border bg-muted/40 text-muted-foreground hover:border-primary/60"}`}>
                      {editDocuments.transcript ? <Check className="w-4 h-4 text-green-600" /> : <Upload className="w-4 h-4" />}
                      <span>{editDocuments.transcript ? editDocuments.transcript.name : "Click to upload or drag file"}</span>
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Upload Certificates</span>
                      {editDocuments.certificates.length > 0 && <span className="text-xs text-muted-foreground">({editDocuments.certificates.length} file{editDocuments.certificates.length !== 1 ? "s" : ""})</span>}
                    </div>
                    <input id="edit-certificate" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => { const file = e.target.files?.[0] ?? null; if (file) { setEditDocuments((prev) => ({ ...prev, certificates: [...prev.certificates, file] })); e.target.value = ""; } }} className="hidden" />
                    {editDocuments.certificates.length > 0 && (
                      <div className="space-y-2">
                        {editDocuments.certificates.map((cert, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 rounded-lg border border-green-500 bg-green-50 px-3 py-2 text-sm text-green-700">
                            <div className="flex items-center gap-2 flex-1 min-w-0"><Check className="w-4 h-4 text-green-600 shrink-0" /><span className="truncate">{cert.name}</span></div>
                            <button type="button" onClick={() => setEditDocuments((prev) => ({ ...prev, certificates: prev.certificates.filter((_, i) => i !== idx) }))} className="text-green-600 hover:text-green-800 font-medium text-xs shrink-0">Remove</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <label htmlFor="edit-certificate" className="flex items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground hover:border-primary/60 transition-colors cursor-pointer">
                      <Upload className="w-4 h-4" /><span>Click to upload or drag files</span>
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">Supported formats: PDF, DOCX, DOC, JPG, PNG</p>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" type="button" onClick={() => { setShowEdit(false); setEditingApplicantId(null); setEditSectionIndex(0); setEditDocuments({ resume: null, transcript: null, certificates: [] }); }}>Cancel</Button>
                <Button type="button" variant="outline" onClick={() => setEditSectionIndex((prev) => Math.max(0, prev - 1))} disabled={editSectionIndex === 0}>Previous Section</Button>
                {editSectionIndex < createSectionIds.length - 1 ? (
                  <Button type="button" onClick={() => setEditSectionIndex((prev) => Math.min(createSectionIds.length - 1, prev + 1))}>Next Section</Button>
                ) : (
                  <Button type="submit" disabled={updateMutation.isPending}>Save Changes</Button>
                )}
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filter */}
      <Card className="border border-border/50 shadow-sm">
        <CardContent className="pt-4 pb-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Search Applicants</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name or email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Filter by Application Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Application Received">Application Received</SelectItem>
                <SelectItem value="Under Initial Screening">Under Initial Screening</SelectItem>
                <SelectItem value="For Examination">For Examination</SelectItem>
                <SelectItem value="For Interview">For Interview</SelectItem>
                <SelectItem value="For Final Evaluation">For Final Evaluation</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Hired">Hired</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border border-border/50 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm font-medium">No applicants found</p>
              <p className="text-xs mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="w-full overflow-x-hidden">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="border-b border-border/70 bg-primary text-primary-foreground hover:bg-primary">
                    <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Name</TableHead>
                    <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Email</TableHead>
                    <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Contact</TableHead>
                    <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Address</TableHead>
                    <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Status</TableHead>
                    <TableHead className="h-12 px-4 text-right text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((applicant, idx) => {
                    const apps = getApplicantApplications(applicant.id);
                    const latestApp = apps.length > 0 ? apps[0] : null;
                    const hasApplication = Boolean(latestApp);
                    return (
                      <TableRow
                        key={applicant.id}
                        className={`border-b border-border/20 h-14 transition-colors ${
                          idx % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/20"
                        }`}
                      >
                        <TableCell className="px-4 py-3 text-sm font-medium text-foreground truncate">
                          {applicant.fullName}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-muted-foreground truncate">
                          {applicant.email}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                          {applicant.contactNumber}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-muted-foreground truncate">
                          {applicant.address}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          {latestApp ? (
                            <span className={`status-badge text-xs ${getStatusColor(latestApp.status)}`}>
                              {latestApp.status}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No application yet</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => openViewApplicant(applicant.id)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Button>
                            {!hasApplication && (
                              <Button type="button" size="sm" onClick={() => openApplicantApplicationForm(applicant.id)}>
                                <Briefcase className="mr-2 h-4 w-4" />
                                Add to Vacancy
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={showView}
        onOpenChange={(open) => {
          setShowView(open);
          if (!open) {
            setViewingApplicantId(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {viewingApplicantId && (() => {
            const applicant = applicants.find((a) => a.id === viewingApplicantId);
            if (!applicant) return null;
            const apps = getApplicantApplications(applicant.id);
            const children = parseChildrenInfo(applicant.childrenInfo || "");
            const educationRows = parseEducationalBackground(applicant.educationalBackground || "");
            const civilServiceRows = parseCivilServiceEligibility(applicant.civilServiceEligibility || "");
            const workRows = parseWorkExperience(applicant.workExperience || "");
            const voluntaryRows = parseVoluntaryWork(applicant.voluntaryWork || "");
            const trainingRows = parseTrainings(applicant.trainings || "");
            const otherInfoRows = parseOtherInfo(applicant.otherInfo || "");
            return (
              <>
                <DialogHeader className="space-y-3">
                  <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-start sm:justify-between">
                    <DialogTitle className="pr-2">{applicant.fullName}</DialogTitle>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { void handleExportApplicant("pdf"); }}
                        disabled={isExportingApplicant}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        PDF
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { void handleExportApplicant("docx"); }}
                        disabled={isExportingApplicant}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        DOCX
                      </Button>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-3 border-t pt-3">
                    <h4 className="font-semibold text-sm">I. Personal Information</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{applicant.contactNumber || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{applicant.email || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                        <MapPin className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{applicant.address || "N/A"}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      {[
                        ["Full Name", applicant.fullName],
                        ["Telephone No.", applicant.telephoneNumber],
                        ["Date of Birth", applicant.dateOfBirth],
                        ["Place of Birth", applicant.placeOfBirth],
                        ["Sex at Birth", applicant.sex],
                        ["Civil Status", applicant.civilStatus],
                        ["Citizenship", applicant.citizenship],
                        ["Citizenship Details", applicant.citizenshipDetails],
                        ["Height", applicant.height],
                        ["Weight", applicant.weight],
                        ["Blood Type", applicant.bloodType],
                        ["Permanent Address", applicant.permanentAddress],
                        ["GSIS ID No.", applicant.gsisIdNo],
                        ["PhilSys No.", applicant.philsysNo],
                        ["PAG-IBIG No.", applicant.pagibigIdNo],
                        ["PhilHealth No.", applicant.philhealthNo],
                        ["SSS No.", applicant.sssNo],
                        ["TIN No.", applicant.tinNo],
                        ["Agency Employee No.", applicant.agencyEmployeeNo]
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                          <p className="text-muted-foreground">{label}</p>
                          <p className="font-medium text-foreground">{value || "N/A"}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-3">
                    <h4 className="font-semibold text-sm">II. Family Background</h4>
                    <div className="space-y-3">
                      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                        <p className="font-medium text-foreground mb-2">Spouse Information</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div><p className="text-muted-foreground">Name:</p><p className="font-medium">{[applicant.spouseSurname, applicant.spouseFirstName, applicant.spouseMiddleName, applicant.spouseNameExtension].filter(Boolean).join(" ") || "N/A"}</p></div>
                          <div><p className="text-muted-foreground">Occupation:</p><p className="font-medium">{applicant.spouseOccupation || "N/A"}</p></div>
                          <div><p className="text-muted-foreground">Employer/Business:</p><p className="font-medium">{applicant.spouseEmployerBusinessName || "N/A"}</p></div>
                          <div><p className="text-muted-foreground">Business Address:</p><p className="font-medium">{applicant.spouseBusinessAddress || "N/A"}</p></div>
                          <div className="col-span-2"><p className="text-muted-foreground">Telephone:</p><p className="font-medium">{applicant.spouseTelephoneNo || "N/A"}</p></div>
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                        <p className="font-medium text-foreground mb-2">Father's Information</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2"><p className="text-muted-foreground">Name:</p><p className="font-medium">{[applicant.fatherSurname, applicant.fatherFirstName, applicant.fatherMiddleName, applicant.fatherNameExtension].filter(Boolean).join(" ") || "N/A"}</p></div>
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                        <p className="font-medium text-foreground mb-2">Mother's Information (Maiden Name)</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2"><p className="text-muted-foreground">Name:</p><p className="font-medium">{[applicant.motherSurname, applicant.motherFirstName, applicant.motherMiddleName].filter(Boolean).join(" ") || "N/A"}</p></div>
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                        <p className="font-medium text-foreground mb-2">Children</p>
                        <div className="space-y-2">
                          {children.length > 0 ? children.map((child, index) => (
                            <div key={index} className="flex justify-between text-muted-foreground">
                              <span>{child.fullName || "N/A"}</span>
                              <span>{child.dateOfBirth || "N/A"}</span>
                            </div>
                          )) : <p className="text-muted-foreground">No children listed.</p>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-3">
                    <h4 className="font-semibold text-sm">III. Educational Background</h4>
                    <div className="space-y-2">
                      {educationRows.length > 0 ? educationRows.map((edu, index) => (
                        <div key={index} className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div><p className="text-muted-foreground">Level:</p><p className="font-medium">{edu.level || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Year Graduated:</p><p className="font-medium">{edu.yearGraduated || "N/A"}</p></div>
                            <div className="col-span-2"><p className="text-muted-foreground">School:</p><p className="font-medium">{edu.schoolName || "N/A"}</p></div>
                            <div className="col-span-2"><p className="text-muted-foreground">Degree/Course:</p><p className="font-medium">{edu.degreeCourse || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">From:</p><p className="font-medium">{edu.attendanceFrom || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">To:</p><p className="font-medium">{edu.attendanceTo || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Units Earned:</p><p className="font-medium">{edu.highestLevelUnitsEarned || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Honors:</p><p className="font-medium">{edu.scholarshipHonors || "N/A"}</p></div>
                          </div>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">No educational background provided.</p>}
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-3">
                    <h4 className="font-semibold text-sm">IV. Civil Service Eligibility</h4>
                    <div className="space-y-2">
                      {civilServiceRows.length > 0 ? civilServiceRows.map((cse, index) => (
                        <div key={index} className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div><p className="text-muted-foreground">Eligibility:</p><p className="font-medium">{cse.eligibility || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Rating:</p><p className="font-medium">{cse.rating || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Exam Date:</p><p className="font-medium">{cse.examDate || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Exam Place:</p><p className="font-medium">{cse.examPlace || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">License #:</p><p className="font-medium">{cse.licenseNumber || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Valid Until:</p><p className="font-medium">{cse.licenseValidUntil || "N/A"}</p></div>
                          </div>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">No civil service eligibility listed.</p>}
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-3">
                    <h4 className="font-semibold text-sm">V. Work Experience</h4>
                    <div className="space-y-2">
                      {workRows.length > 0 ? workRows.map((work, index) => (
                        <div key={index} className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2"><p className="text-muted-foreground">Position Title:</p><p className="font-medium">{work.positionTitle || "N/A"}</p></div>
                            <div className="col-span-2"><p className="text-muted-foreground">Department/Agency/Company:</p><p className="font-medium">{work.departmentAgencyOfficeCompany || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">From:</p><p className="font-medium">{work.dateFrom || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">To:</p><p className="font-medium">{work.dateTo || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Status:</p><p className="font-medium">{work.statusOfAppointment || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Govt Service:</p><p className="font-medium">{work.isGovtService || "N/A"}</p></div>
                          </div>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">No work experience listed.</p>}
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-3">
                    <h4 className="font-semibold text-sm">VI. Voluntary Work or Involvement in Civic/Non-Government/People/Voluntary Organizations</h4>
                    <div className="space-y-2">
                      {voluntaryRows.length > 0 ? voluntaryRows.map((vol, index) => (
                        <div key={index} className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2"><p className="text-muted-foreground">Organization:</p><p className="font-medium">{vol.organizationNameAddress || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">From:</p><p className="font-medium">{vol.dateFrom || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">To:</p><p className="font-medium">{vol.dateTo || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Hours:</p><p className="font-medium">{vol.numberOfHours || "N/A"}</p></div>
                            <div className="col-span-2"><p className="text-muted-foreground">Position/Nature of Work:</p><p className="font-medium">{vol.positionNatureOfWork || "N/A"}</p></div>
                          </div>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">No voluntary work listed.</p>}
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-3">
                    <h4 className="font-semibold text-sm">VII. Learning and Development (L&D) Interventions/Training Programs Attended</h4>
                    <div className="space-y-2">
                      {trainingRows.length > 0 ? trainingRows.map((training, index) => (
                        <div key={index} className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2"><p className="text-muted-foreground">Training Title:</p><p className="font-medium">{training.title || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">From:</p><p className="font-medium">{training.dateFrom || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">To:</p><p className="font-medium">{training.dateTo || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Hours:</p><p className="font-medium">{training.numberOfHours || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Type:</p><p className="font-medium">{training.typeOfLd || "N/A"}</p></div>
                            <div className="col-span-2"><p className="text-muted-foreground">Conducted/Sponsored By:</p><p className="font-medium">{training.conductedSponsoredBy || "N/A"}</p></div>
                          </div>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">No training records listed.</p>}
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-3">
                    <h4 className="font-semibold text-sm">VIII. Other Information</h4>
                    <div className="space-y-2">
                      {otherInfoRows.length > 0 ? otherInfoRows.map((info, index) => (
                        <div key={index} className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                          <div className="grid grid-cols-1 gap-2">
                            <div><p className="text-muted-foreground">Special Skills/Hobbies:</p><p className="font-medium">{info.specialSkillsHobbies || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Non-Academic Distinctions:</p><p className="font-medium">{info.nonAcademicDistinctionsRecognition || "N/A"}</p></div>
                            <div><p className="text-muted-foreground">Memberships:</p><p className="font-medium">{info.membershipsAssociationOrganization || "N/A"}</p></div>
                          </div>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">No other information listed.</p>}
                    </div>
                    <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                      <p className="text-muted-foreground mb-2">References:</p>
                      <p className="font-medium whitespace-pre-wrap">{applicant.referencesInfo || "N/A"}</p>
                    </div>
                  </div>
                  {apps.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Applications ({apps.length})</p>
                      {apps.map((app) => {
                        const vac = jobVacancies.find((v) => v.id === app.vacancyId);
                        return (
                          <div key={app.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                            <span>{vac?.positionTitle}</span>
                            <span className={`status-badge text-xs ${getStatusColor(app.status)}`}>{app.status}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {apps.length === 0 && (
                    <div className="border-t pt-3">
                      <div className="rounded-md border border-dashed border-border/70 bg-muted/20 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Not yet linked to a vacancy</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Create an application first so this applicant appears in application tracking.
                          </p>
                        </div>
                        <Button type="button" onClick={() => openApplicantApplicationForm(applicant.id)}>
                          <Briefcase className="mr-2 h-4 w-4" />
                          Add to Vacancy
                        </Button>
                      </div>
                    </div>
                  )}
                  {applicantDocuments.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Submitted Documents ({applicantDocuments.length})</p>
                      <div className="space-y-2">
                        {applicantDocuments.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                            <div className="flex-1">
                              <p className="font-medium text-xs">{doc.originalName}</p>
                              <p className="text-xs text-muted-foreground">{doc.docType}</p>
                            </div>
                            <a
                              href={getFileUrl(doc.url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                            >
                              View
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCreateApp}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateApp(false);
            setSelectedApplicantForApp(null);
            setAppFormState({ vacancyId: "", dateApplied: new Date().toISOString().split("T")[0] });
          }
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Add Job Application</DialogTitle></DialogHeader>
          {selectedApplicantForApp && (
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault();
              if (!appFormState.vacancyId) return;
              createAppMutation.mutate({
                applicantId: selectedApplicantForApp,
                vacancyId: appFormState.vacancyId,
                dateApplied: appFormState.dateApplied
              });
            }}>
              <div className="text-sm text-muted-foreground">
                Applicant: <span className="font-medium text-foreground">{applicants.find(a => a.id === selectedApplicantForApp)?.fullName}</span>
              </div>
              <div className="space-y-2">
                <Label>Job Vacancy</Label>
                <Select value={appFormState.vacancyId} onValueChange={(value) => setAppFormState((prev) => ({ ...prev, vacancyId: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select a job vacancy" /></SelectTrigger>
                  <SelectContent>
                    {jobVacancies.filter(v => v.status === "Open").map((job) => (
                      <SelectItem key={job.id} value={job.id}>{job.positionTitle}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date Applied</Label>
                <Input
                  type="date"
                  value={appFormState.dateApplied}
                  onChange={(e) => setAppFormState((prev) => ({ ...prev, dateApplied: e.target.value }))}
                />
              </div>
              <Button className="w-full" type="submit" disabled={createAppMutation.isPending}>Save Application</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}