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
  const [childrenEntries, setChildrenEntries] = useState<ChildEntry[]>([{ fullName: "", dateOfBirth: "" }]);
  const [educationEntries, setEducationEntries] = useState<EducationEntry[]>(buildDefaultEducationEntries());
  const [civilServiceEntries, setCivilServiceEntries] = useState<CivilServiceEntry[]>([createCivilServiceEntry()]);
  const [workExperienceEntries, setWorkExperienceEntries] = useState<WorkExperienceEntry[]>([createWorkExperienceEntry()]);
  const [voluntaryWorkEntries, setVoluntaryWorkEntries] = useState<VoluntaryWorkEntry[]>([createVoluntaryWorkEntry()]);
  const [trainingEntries, setTrainingEntries] = useState<TrainingEntry[]>([createTrainingEntry()]);
  const [otherInfoEntries, setOtherInfoEntries] = useState<OtherInfoEntry[]>([createOtherInfoEntry()]);
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
      const relatedApplications = applications.filter((application) => application.applicantId === applicant.id);
      const fileNameBase = `${applicant.fullName || "applicant"}`
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\s+/g, "_") || "applicant";

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

      const personalRows: Array<[string, string]> = [
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
      ];

      const familyRows: Array<[string, string]> = [
        ["Spouse Name", formatExportValue([applicant.spouseSurname, applicant.spouseFirstName, applicant.spouseMiddleName, applicant.spouseNameExtension].filter(Boolean).join(" "))],
        ["Spouse Occupation", formatExportValue(applicant.spouseOccupation)],
        ["Spouse Employer / Business", formatExportValue(applicant.spouseEmployerBusinessName)],
        ["Spouse Business Address", formatExportValue(applicant.spouseBusinessAddress)],
        ["Spouse Telephone", formatExportValue(applicant.spouseTelephoneNo)],
        ["Father Name", formatExportValue([applicant.fatherSurname, applicant.fatherFirstName, applicant.fatherMiddleName, applicant.fatherNameExtension].filter(Boolean).join(" "))],
        ["Mother Maiden Name", formatExportValue([applicant.motherSurname, applicant.motherFirstName, applicant.motherMiddleName].filter(Boolean).join(" "))]
      ];

      const applicationRows = relatedApplications.map((app) => {
        const vacancy = jobVacancies.find((vacancyItem) => vacancyItem.id === app.vacancyId);
        return [formatExportValue(vacancy?.positionTitle), formatExportValue(app.status), formatExportValue(app.dateApplied), formatExportValue(app.remarks)];
      });

      const documentRows = applicantDocuments.map((doc) => [formatExportValue(doc.originalName), formatExportValue(doc.docType)]);

      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const contentWidth = pageWidth - margin * 2;
        let cursorY = margin;

        // Helper: Draw text with proper line breaking
        const drawText = (text: string, x: number, y: number, options: any = {}) => {
          const { fontSize = 10, bold = false, maxWidth = contentWidth, align = "left" } = options;
          pdf.setFontSize(fontSize);
          pdf.setFont("helvetica", bold ? "bold" : "normal");
          pdf.text(text, x, y, { maxWidth, align });
        };

        // Helper: Draw a section header with official look
        const drawSectionHeader = (number: string, title: string) => {
          if (cursorY + 8 > pageHeight - margin) {
            pdf.addPage();
            cursorY = margin;
          }
          pdf.setFillColor(45, 85, 145); // Official blue
          pdf.rect(margin, cursorY, contentWidth, 7, "F");
          drawText(`${number}. ${title}`, margin + 2, cursorY + 5, { fontSize: 10, bold: true, maxWidth: contentWidth - 2 });
          pdf.setDrawColor(200, 200, 200);
          pdf.setLineWidth(0.3);
          cursorY += 8;
        };

        // Helper: Draw a 2-column field row
        const drawFieldRow = (field1Label: string, field1Value: string, field2Label: string, field2Value: string) => {
          const colWidth = (contentWidth - 1) / 2;
          const fieldHeight = 12;
          
          if (cursorY + fieldHeight > pageHeight - margin) {
            pdf.addPage();
            cursorY = margin;
          }

          // Column 1
          pdf.setLineWidth(0.3);
          pdf.setDrawColor(180, 180, 180);
          pdf.rect(margin, cursorY, colWidth, fieldHeight);
          drawText(field1Label, margin + 1, cursorY + 3, { fontSize: 8, bold: true, maxWidth: colWidth - 2 });
          drawText(field1Value, margin + 1, cursorY + 7.5, { fontSize: 9, maxWidth: colWidth - 2 });

          // Column 2
          pdf.rect(margin + colWidth + 1, cursorY, colWidth - 1, fieldHeight);
          drawText(field2Label, margin + colWidth + 2, cursorY + 3, { fontSize: 8, bold: true, maxWidth: colWidth - 3 });
          drawText(field2Value, margin + colWidth + 2, cursorY + 7.5, { fontSize: 9, maxWidth: colWidth - 3 });

          cursorY += fieldHeight;
        };

        // Helper: Draw full-width field
        const drawFullWidthField = (label: string, value: string) => {
          const fieldHeight = 10;
          
          if (cursorY + fieldHeight > pageHeight - margin) {
            pdf.addPage();
            cursorY = margin;
          }

          pdf.setLineWidth(0.3);
          pdf.setDrawColor(180, 180, 180);
          pdf.rect(margin, cursorY, contentWidth, fieldHeight);
          drawText(label, margin + 1, cursorY + 3, { fontSize: 8, bold: true, maxWidth: contentWidth - 2 });
          drawText(value, margin + 1, cursorY + 7, { fontSize: 9, maxWidth: contentWidth - 2 });

          cursorY += fieldHeight;
        };

        // Helper: Draw table
        const drawTable = (headers: string[], rows: string[][], columnWidths: number[]) => {
          if (cursorY + 8 > pageHeight - margin) {
            pdf.addPage();
            cursorY = margin;
          }

          const headerHeight = 7;
          const rowHeight = 6;

          // Draw headers
          pdf.setFillColor(220, 220, 220);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          let startX = margin;

          for (let i = 0; i < headers.length; i++) {
            pdf.setLineWidth(0.3);
            pdf.setDrawColor(150, 150, 150);
            pdf.rect(startX, cursorY, columnWidths[i], headerHeight);
            pdf.text(headers[i], startX + 0.5, cursorY + 5, { maxWidth: columnWidths[i] - 1 });
            startX += columnWidths[i];
          }
          cursorY += headerHeight;

          // Draw rows
          if (rows.length === 0) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(8);
            pdf.rect(margin, cursorY, contentWidth, rowHeight);
            pdf.text("No records", margin + 0.5, cursorY + 4);
            cursorY += rowHeight;
          } else {
            rows.forEach((row) => {
              if (cursorY + rowHeight > pageHeight - margin) {
                pdf.addPage();
                cursorY = margin;
              }

              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(7.5);
              startX = margin;

              for (let i = 0; i < row.length; i++) {
                pdf.setLineWidth(0.3);
                pdf.setDrawColor(200, 200, 200);
                pdf.rect(startX, cursorY, columnWidths[i], rowHeight);
                const text = formatExportValue(row[i]);
                pdf.text(text, startX + 0.5, cursorY + 4, { maxWidth: columnWidths[i] - 1 });
                startX += columnWidths[i];
              }
              cursorY += rowHeight;
            });
          }

          cursorY += 2;
        };

        // ===== START DOCUMENT =====
        
        // Header
        drawText("PERSONAL DATA SHEET", pageWidth / 2, cursorY + 4, { fontSize: 14, bold: true, align: "center" });
        cursorY += 10;
        
        drawText(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, cursorY, { fontSize: 8, align: "center" });
        drawText(`Applicant: ${applicant.fullName || "N/A"}`, pageWidth / 2, cursorY + 3, { fontSize: 8, align: "center" });
        cursorY += 8;

        // I. PERSONAL INFORMATION
        drawSectionHeader("I", "PERSONAL INFORMATION");
        
        drawFieldRow("Surname/First/Middle", formatExportValue(applicant.fullName), "Date of Birth", formatExportValue(applicant.dateOfBirth));
        drawFieldRow("Place of Birth", formatExportValue(applicant.placeOfBirth), "Sex", formatExportValue(applicant.sex));
        drawFieldRow("Civil Status", formatExportValue(applicant.civilStatus), "Citizenship", formatExportValue(applicant.citizenship));
        drawFieldRow("Height (cm)", formatExportValue(applicant.height), "Weight (kg)", formatExportValue(applicant.weight));
        drawFieldRow("Blood Type", formatExportValue(applicant.bloodType), "Citizenship Details", formatExportValue(applicant.citizenshipDetails));
        
        drawFullWidthField("Address", formatExportValue(applicant.address));
        drawFullWidthField("Permanent Address", formatExportValue(applicant.permanentAddress));
        drawFullWidthField("Telephone", formatExportValue(applicant.telephoneNumber));
        drawFullWidthField("Mobile/Email", `${formatExportValue(applicant.contactNumber)} / ${formatExportValue(applicant.email)}`);
        
        drawFieldRow("GSIS No.", formatExportValue(applicant.gsisIdNo), "SSS No.", formatExportValue(applicant.sssNo));
        drawFieldRow("TIN No.", formatExportValue(applicant.tinNo), "Pag-Ibig No.", formatExportValue(applicant.pagibigIdNo));
        drawFieldRow("PhilHealth No.", formatExportValue(applicant.philhealthNo), "PhilSys No.", formatExportValue(applicant.philsysNo));
        drawFullWidthField("Agency Employee No.", formatExportValue(applicant.agencyEmployeeNo));

        // II. FAMILY BACKGROUND
        drawSectionHeader("II", "FAMILY BACKGROUND");
        drawFieldRow("Spouse Name", formatExportValue([applicant.spouseSurname, applicant.spouseFirstName].filter(Boolean).join(" ")), "Occupation", formatExportValue(applicant.spouseOccupation));
        drawFullWidthField("Employer/Business Name", formatExportValue(applicant.spouseEmployerBusinessName));
        drawFieldRow("Business Address", formatExportValue(applicant.spouseBusinessAddress), "Telephone", formatExportValue(applicant.spouseTelephoneNo));
        drawFieldRow("Father Name", formatExportValue([applicant.fatherSurname, applicant.fatherFirstName].filter(Boolean).join(" ")), "Mother Name", formatExportValue([applicant.motherSurname, applicant.motherFirstName].filter(Boolean).join(" ")));

        // III. EDUCATIONAL BACKGROUND
        drawSectionHeader("III", "EDUCATIONAL BACKGROUND");
        drawTable(
          ["Level", "School", "Degree/Course", "From", "To", "Units", "Year", "Honors"],
          educationRows.map((row) => [
            formatExportValue(row.level),
            formatExportValue(row.schoolName),
            formatExportValue(row.degreeCourse),
            formatExportValue(row.attendanceFrom),
            formatExportValue(row.attendanceTo),
            formatExportValue(row.highestLevelUnitsEarned),
            formatExportValue(row.yearGraduated),
            formatExportValue(row.scholarshipHonors)
          ]),
          [15, 25, 25, 12, 12, 10, 10, 15]
        );

        // IV. CIVIL SERVICE ELIGIBILITY
        drawSectionHeader("IV", "CIVIL SERVICE ELIGIBILITY");
        drawTable(
          ["Eligibility", "Rating", "Exam Date", "Exam Place", "License No.", "Validity"],
          civilServiceRows.map((row) => [
            formatExportValue(row.eligibility),
            formatExportValue(row.rating),
            formatExportValue(row.examDate),
            formatExportValue(row.examPlace),
            formatExportValue(row.licenseNumber),
            formatExportValue(row.licenseValidUntil)
          ]),
          [25, 12, 15, 30, 20, 17]
        );

        // V. WORK EXPERIENCE
        drawSectionHeader("V", "WORK EXPERIENCE");
        drawTable(
          ["From", "To", "Position", "Agency/Company", "Status", "Govt"],
          workRows.map((row) => [
            formatExportValue(row.dateFrom),
            formatExportValue(row.dateTo),
            formatExportValue(row.positionTitle),
            formatExportValue(row.departmentAgencyOfficeCompany),
            formatExportValue(row.statusOfAppointment),
            row.isGovtService === "Y" ? "Y" : row.isGovtService === "N" ? "N" : ""
          ]),
          [12, 12, 20, 30, 15, 8]
        );

        // VI. VOLUNTARY WORK
        drawSectionHeader("VI", "VOLUNTARY WORK");
        drawTable(
          ["Organization", "From", "To", "Hours", "Position/Nature"],
          voluntaryRows.map((row) => [
            formatExportValue(row.organizationNameAddress),
            formatExportValue(row.dateFrom),
            formatExportValue(row.dateTo),
            formatExportValue(row.numberOfHours),
            formatExportValue(row.positionNatureOfWork)
          ]),
          [35, 12, 12, 12, 38]
        );

        // VII. LEARNING AND DEVELOPMENT
        drawSectionHeader("VII", "LEARNING AND DEVELOPMENT (L&D)");
        drawTable(
          ["Title", "From", "To", "Hours", "Type", "Conducted By"],
          trainingRows.map((row) => [
            formatExportValue(row.title),
            formatExportValue(row.dateFrom),
            formatExportValue(row.dateTo),
            formatExportValue(row.numberOfHours),
            formatExportValue(row.typeOfLd),
            formatExportValue(row.conductedSponsoredBy)
          ]),
          [25, 12, 12, 10, 15, 30]
        );

        // VIII. OTHER INFORMATION
        drawSectionHeader("VIII", "OTHER INFORMATION");
        drawTable(
          ["Special Skills", "Non-Academic Distinctions", "Memberships/Organization"],
          otherInfoRows.map((row) => [
            formatExportValue(row.specialSkillsHobbies),
            formatExportValue(row.nonAcademicDistinctionsRecognition),
            formatExportValue(row.membershipsAssociationOrganization)
          ]),
          [33, 33, 33]
        );
        drawFullWidthField("References", formatExportValue(applicant.referencesInfo));

        // IX. APPLICATIONS
        drawSectionHeader("IX", "APPLICATIONS");
        drawTable(
          ["Position", "Status", "Date Applied", "Remarks"],
          applicationRows,
          [35, 25, 20, 29]
        );

        // X. SUBMITTED DOCUMENTS
        drawSectionHeader("X", "SUBMITTED DOCUMENTS");
        drawTable(
          ["Document Name", "Type"],
          documentRows,
          [69, 20]
        );

        pdf.save(`${fileNameBase}.pdf`);
      } else {
        const {
          AlignmentType,
          BorderStyle,
          Document,
          HeadingLevel,
          Packer,
          Paragraph,
          ShadingType,
          Table,
          TableCell,
          TableRow,
          TextRun,
          WidthType
        } = await import("docx");

        const buildHeading = (title: string) =>
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 180, after: 90 },
            children: [new TextRun({ text: title, bold: true })]
          });

        const buildKeyValueTable = (rows: Array<[string, string]>) =>
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: rows.map(([label, value]) =>
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 35, type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })]
                  }),
                  new TableCell({
                    width: { size: 65, type: WidthType.PERCENTAGE },
                    children: [new Paragraph(formatExportValue(value))]
                  })
                ]
              })
            )
          });

        const buildGridTable = (headers: string[], rows: string[][]) =>
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: headers.map((header) =>
                  new TableCell({
                    shading: { fill: "EDEDED", type: ShadingType.CLEAR, color: "auto" },
                    children: [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })]
                  })
                )
              }),
              ...(rows.length > 0
                ? rows.map((row) =>
                    new TableRow({
                      children: row.map((cell) => new TableCell({ children: [new Paragraph(formatExportValue(cell))] }))
                    })
                  )
                : [
                    new TableRow({
                      children: headers.map((_, index) =>
                        new TableCell({ children: [new Paragraph(index === 0 ? "No records" : "")] })
                      )
                    })
                  ])
            ]
          });

        const doc = new Document({
          sections: [
            {
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 120 },
                  children: [new TextRun({ text: "PERSONAL DATA SHEET", bold: true, size: 30 })]
                }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(`Generated: ${new Date().toLocaleString()}`)] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 }, children: [new TextRun(`Applicant: ${applicant.fullName || "N/A"}`)] }),

                buildHeading("I. Personal Information"),
                buildKeyValueTable(personalRows),

                buildHeading("II. Family Background"),
                buildKeyValueTable(familyRows),

                buildHeading("III. Educational Background"),
                buildGridTable(
                  ["Level", "School", "Degree/Course", "From", "To", "Units", "Year", "Honors"],
                  educationRows.map((row) => [
                    formatExportValue(row.level),
                    formatExportValue(row.schoolName),
                    formatExportValue(row.degreeCourse),
                    formatExportValue(row.attendanceFrom),
                    formatExportValue(row.attendanceTo),
                    formatExportValue(row.highestLevelUnitsEarned),
                    formatExportValue(row.yearGraduated),
                    formatExportValue(row.scholarshipHonors)
                  ])
                ),

                buildHeading("IV. Civil Service Eligibility"),
                buildGridTable(
                  ["Eligibility", "Rating", "Exam Date", "Exam Place", "License No.", "Validity"],
                  civilServiceRows.map((row) => [
                    formatExportValue(row.eligibility),
                    formatExportValue(row.rating),
                    formatExportValue(row.examDate),
                    formatExportValue(row.examPlace),
                    formatExportValue(row.licenseNumber),
                    formatExportValue(row.licenseValidUntil)
                  ])
                ),

                buildHeading("V. Work Experience"),
                buildGridTable(
                  ["From", "To", "Position Title", "Agency/Company", "Status", "Govt"],
                  workRows.map((row) => [
                    formatExportValue(row.dateFrom),
                    formatExportValue(row.dateTo),
                    formatExportValue(row.positionTitle),
                    formatExportValue(row.departmentAgencyOfficeCompany),
                    formatExportValue(row.statusOfAppointment),
                    row.isGovtService === "Y" ? "Yes" : row.isGovtService === "N" ? "No" : "N/A"
                  ])
                ),

                buildHeading("VI. Voluntary Work"),
                buildGridTable(
                  ["Organization", "From", "To", "Hours", "Position/Nature"],
                  voluntaryRows.map((row) => [
                    formatExportValue(row.organizationNameAddress),
                    formatExportValue(row.dateFrom),
                    formatExportValue(row.dateTo),
                    formatExportValue(row.numberOfHours),
                    formatExportValue(row.positionNatureOfWork)
                  ])
                ),

                buildHeading("VII. Learning and Development (L&D)"),
                buildGridTable(
                  ["Title", "From", "To", "Hours", "Type", "Conducted/Sponsored"],
                  trainingRows.map((row) => [
                    formatExportValue(row.title),
                    formatExportValue(row.dateFrom),
                    formatExportValue(row.dateTo),
                    formatExportValue(row.numberOfHours),
                    formatExportValue(row.typeOfLd),
                    formatExportValue(row.conductedSponsoredBy)
                  ])
                ),

                buildHeading("VIII. Other Information"),
                buildGridTable(
                  ["Special Skills/Hobbies", "Non-Academic Distinctions", "Memberships/Organization"],
                  otherInfoRows.map((row) => [
                    formatExportValue(row.specialSkillsHobbies),
                    formatExportValue(row.nonAcademicDistinctionsRecognition),
                    formatExportValue(row.membershipsAssociationOrganization)
                  ])
                ),
                buildKeyValueTable([["References", formatExportValue(applicant.referencesInfo)]]),

                buildHeading("IX. Applications"),
                buildGridTable(["Position", "Status", "Date Applied", "Remarks"], applicationRows),

                buildHeading("X. Submitted Documents"),
                buildGridTable(["Document Name", "Type"], documentRows)
              ]
            }
          ]
        });

        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileNameBase}.docx`;
        link.click();
        URL.revokeObjectURL(url);
      }

      toast({ title: "Export complete", description: `Applicant exported as ${format.toUpperCase()} successfully.` });
    } catch (error) {
      toast({
        title: "Export failed",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsExportingApplicant(false);
    }
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
      dateOfBirth: draft.dateOfBirth || prev.dateOfBirth,
      placeOfBirth: draft.placeOfBirth || prev.placeOfBirth,
      sex: draft.sex || prev.sex,
      civilStatus: draft.civilStatus || prev.civilStatus,
      citizenship: incomingCitizenship || prev.citizenship,
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

              const hasStructuredAddress = Boolean(addressParts.regionCode && addressParts.cityCode && addressParts.barangayCode);
              const hasFallbackAddress = addressParts.streetAddress.trim().length > 0;

              const fullName = formatFullName(nameParts);
              const address = hasStructuredAddress
                ? formatAddress(addressParts.streetAddress, selectedBarangayName, selectedCityName, selectedRegionName)
                : (addressParts.streetAddress.trim() || "Address not provided");
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
                <div className="space-y-3">
                  <SearchableSelect
                    value={addressParts.regionCode}
                    onValueChange={(regionCode) =>
                      setAddressParts({
                        regionCode,
                        cityCode: "",
                        barangayCode: "",
                        streetAddress: ""
                      })
                    }
                    options={regionOptions}
                    placeholder="Select Region"
                    searchPlaceholder="Search region..."
                    emptyMessage="No region found"
                    loadingMessage={isLoadingRegions ? "Loading regions..." : undefined}
                  />
                  {addressParts.regionCode ? (
                    <SearchableSelect
                      value={addressParts.cityCode}
                      onValueChange={(cityCode) =>
                        setAddressParts((prev) => ({
                          ...prev,
                          cityCode,
                          barangayCode: "",
                          streetAddress: ""
                        }))
                      }
                      options={cityOptions}
                      placeholder="Select City / Municipality"
                      searchPlaceholder="Search city/municipality..."
                      emptyMessage="No city/municipality found"
                      loadingMessage={isLoadingCities ? "Loading cities/municipalities..." : undefined}
                    />
                  ) : null}
                  {addressParts.cityCode ? (
                    <SearchableSelect
                      value={addressParts.barangayCode}
                      onValueChange={(barangayCode) => setAddressParts((prev) => ({ ...prev, barangayCode }))}
                      options={barangayOptions}
                      placeholder="Select Barangay"
                      searchPlaceholder="Search barangay..."
                      emptyMessage="No barangay found"
                      loadingMessage={isLoadingBarangays ? "Loading barangays..." : undefined}
                    />
                  ) : null}
                  {addressParts.barangayCode || addressParts.streetAddress ? (
                    <Input
                      placeholder="Street / Purok / Sitio (Optional)"
                      value={addressParts.streetAddress}
                      onChange={(e) => setAddressParts((prev) => ({ ...prev, streetAddress: e.target.value }))}
                    />
                  ) : null}
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
            setEditDocuments({ resume: null, transcript: null, certificates: [] });
          }
        }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Applicant</DialogTitle></DialogHeader>
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault();
              if (!editingApplicantId) return;
              updateMutation.mutate({ id: editingApplicantId, payload: editFormState });
            }}>
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  placeholder="e.g., Juan Dela Cruz"
                  value={editFormState.fullName}
                  onChange={(e) => setEditFormState((prev) => ({ ...prev, fullName: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Number</Label>
                  <Input
                    placeholder="09XXXXXXXXX"
                    value={editFormState.contactNumber}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, contactNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={editFormState.email}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input
                    placeholder="MM/DD/YYYY"
                    value={editFormState.dateOfBirth}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sex</Label>
                  <Input
                    placeholder="Male or Female"
                    value={editFormState.sex}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, sex: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Civil Status</Label>
                  <Input
                    placeholder="Single, Married, etc."
                    value={editFormState.civilStatus}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, civilStatus: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Citizenship</Label>
                  <Input
                    placeholder="Filipino"
                    value={editFormState.citizenship}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, citizenship: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Height</Label>
                  <Input
                    placeholder="e.g. 1.57 m"
                    value={editFormState.height}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, height: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Weight</Label>
                  <Input
                    placeholder="e.g. 48 kg"
                    value={editFormState.weight}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, weight: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Blood Type</Label>
                  <Input
                    placeholder="A+, B+, O-, etc."
                    value={editFormState.bloodType}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, bloodType: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  placeholder="City, Province"
                  value={editFormState.address}
                  onChange={(e) => setEditFormState((prev) => ({ ...prev, address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Educational Background</Label>
                <Textarea
                  placeholder="Degree - School"
                  value={editFormState.educationalBackground}
                  onChange={(e) => setEditFormState((prev) => ({ ...prev, educationalBackground: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Work Experience</Label>
                <Textarea
                  placeholder="Years and relevant positions"
                  value={editFormState.workExperience}
                  onChange={(e) => setEditFormState((prev) => ({ ...prev, workExperience: e.target.value }))}
                />
              </div>
              
              {/* Document Management */}
              <div className="space-y-3 pt-4 border-t">
                <Label>Manage Documents</Label>
                
                {/* Existing Documents */}
                {editingApplicantDocuments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Current Documents</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {editingApplicantDocuments.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="truncate">{doc.originalName}</span>
                            <span className="text-muted-foreground whitespace-nowrap">({doc.docType})</span>
                          </div>
                          <a
                            href={getFileUrl(doc.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-medium text-xs shrink-0"
                          >
                            View
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add New Documents */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Add New Documents</p>
                  
                  {/* PDS */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground"><span className="text-red-500">*</span> Upload PDS</span>
                    <input
                      id="edit-resume"
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setEditDocuments((prev) => ({ ...prev, resume: file }));
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="edit-resume"
                      className={`flex items-center justify-between gap-2 rounded-lg border-2 border-dashed px-3 py-2 text-xs transition-colors cursor-pointer ${
                        editDocuments.resume
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-border bg-muted/40 text-muted-foreground hover:border-primary/60"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {editDocuments.resume ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        <span>{editDocuments.resume ? editDocuments.resume.name : "Click to upload or drag file"}</span>
                      </div>
                    </label>
                  </div>

                  {/* Transcript */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground"><span className="text-red-500">*</span> Upload Transcript</span>
                    <input
                      id="edit-transcript"
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setEditDocuments((prev) => ({ ...prev, transcript: file }));
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="edit-transcript"
                      className={`flex items-center justify-between gap-2 rounded-lg border-2 border-dashed px-3 py-2 text-xs transition-colors cursor-pointer ${
                        editDocuments.transcript
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-border bg-muted/40 text-muted-foreground hover:border-primary/60"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {editDocuments.transcript ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        <span>{editDocuments.transcript ? editDocuments.transcript.name : "Click to upload or drag file"}</span>
                      </div>
                    </label>
                  </div>

                  {/* Certificates */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground"><span className="text-red-500">*</span> Upload Certificates</span>
                      {editDocuments.certificates.length > 0 && (
                        <span className="text-xs text-muted-foreground">({editDocuments.certificates.length} file{editDocuments.certificates.length !== 1 ? "s" : ""})</span>
                      )}
                    </div>
                    <input
                      id="edit-certificate"
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        if (file) {
                          setEditDocuments((prev) => ({ ...prev, certificates: [...prev.certificates, file] }));
                          e.target.value = "";
                        }
                      }}
                      className="hidden"
                    />
                    {editDocuments.certificates.length > 0 && (
                      <div className="space-y-2">
                        {editDocuments.certificates.map((cert, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 rounded-lg border border-green-500 bg-green-50 px-3 py-2 text-sm text-green-700">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Check className="w-4 h-4 text-green-600 shrink-0" />
                              <span className="truncate">{cert.name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setEditDocuments((prev) => ({
                                  ...prev,
                                  certificates: prev.certificates.filter((_, i) => i !== idx)
                                }));
                              }}
                              className="text-green-600 hover:text-green-800 font-medium text-xs shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <label
                      htmlFor="edit-certificate"
                      className="flex items-center justify-between gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground hover:border-primary/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        <span>Click to upload or drag files</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" type="button" onClick={() => {
                  setShowEdit(false);
                  setEditingApplicantId(null);
                  setEditDocuments({ resume: null, transcript: null, certificates: [] });
                }}>Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}>Save Changes</Button>
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
