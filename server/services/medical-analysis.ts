import { storage } from "../storage";
import { HospitalCall, HospitalCallSegment } from "@shared/schema";

interface MedicalAnalysis {
  chiefComplaint: string | null;
  vitalSigns: string[];
  medications: string[];
  procedures: string[];
  urgencyLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  keyFindings: string[];
  hospitalTransport: boolean;
  patientAge: string | null;
  patientGender: string | null;
  summary: string;
}

export class MedicalAnalysisService {
  // Medical terminology patterns
  private static readonly VITAL_SIGNS_PATTERNS = [
    /blood pressure|bp|systolic|diastolic/i,
    /heart rate|hr|pulse|bpm/i,
    /respiratory rate|rr|breathing|respiration/i,
    /temperature|temp|fever/i,
    /oxygen saturation|sat|spo2|o2/i,
    /glucose|blood sugar|bs/i,
  ];

  private static readonly MEDICATION_PATTERNS = [
    /aspirin|asa/i,
    /nitroglycerin|nitro/i,
    /epinephrine|epi/i,
    /albuterol/i,
    /morphine|fentanyl/i,
    /narcan|naloxone/i,
    /amiodarone|lidocaine/i,
    /adenosine/i,
    /atropine/i,
    /dextrose|d50/i,
    /calcium/i,
    /bicarb|sodium bicarb/i,
  ];

  private static readonly PROCEDURE_PATTERNS = [
    /iv|intravenous|line established/i,
    /intubation|intubated|tube|airway/i,
    /cpr|chest compressions/i,
    /defibrillation|shocked|aed/i,
    /12-lead|ecg|ekg/i,
    /splint|immobilization/i,
    /c-spine|cervical collar/i,
    /tourniquet/i,
  ];

  private static readonly CHIEF_COMPLAINT_PATTERNS = [
    /chest pain|cp/i,
    /shortness of breath|sob|difficulty breathing/i,
    /cardiac arrest|code blue/i,
    /stroke|cva|cerebrovascular/i,
    /seizure|convulsions/i,
    /trauma|mvc|motor vehicle/i,
    /overdose|od/i,
    /fall|ground level fall/i,
    /syncope|passed out|unconscious/i,
    /abdominal pain|abd pain/i,
  ];

  private static readonly URGENCY_KEYWORDS = {
    CRITICAL: [
      "cardiac arrest",
      "code blue",
      "unresponsive",
      "no pulse",
      "apnea",
      "severe trauma",
      "massive bleeding",
      "stroke",
      "seizure",
      "unconscious",
    ],
    HIGH: [
      "chest pain",
      "difficulty breathing",
      "altered mental status",
      "trauma",
      "severe pain",
      "overdose",
      "emergency",
      "urgent",
    ],
    MEDIUM: [
      "moderate pain",
      "stable",
      "alert",
      "conscious",
      "minor injury",
      "evaluation needed",
    ],
    LOW: [
      "minor",
      "stable vital signs",
      "ambulatory",
      "refused transport",
      "no acute distress",
    ],
  };

  async analyzeHospitalCall(hospitalCallId: number): Promise<MedicalAnalysis> {
    const hospitalCall = await storage.getHospitalCall(hospitalCallId);
    if (!hospitalCall) {
      throw new Error("Hospital call not found");
    }

    const segments = await storage.getHospitalCallSegments(hospitalCallId);
    const fullTranscript = segments
      .map((s) => s.transcript)
      .filter(Boolean)
      .join(" ");

    return this.extractMedicalInformation(fullTranscript);
  }

  private extractMedicalInformation(transcript: string): MedicalAnalysis {
    const vitalSigns = this.extractMatches(
      transcript,
      MedicalAnalysisService.VITAL_SIGNS_PATTERNS,
    );
    const medications = this.extractMatches(
      transcript,
      MedicalAnalysisService.MEDICATION_PATTERNS,
    );
    const procedures = this.extractMatches(
      transcript,
      MedicalAnalysisService.PROCEDURE_PATTERNS,
    );
    const chiefComplaint = this.extractChiefComplaint(transcript);
    const urgencyLevel = this.determineUrgencyLevel(transcript);
    const { patientAge, patientGender } =
      this.extractPatientDemographics(transcript);
    const hospitalTransport = this.detectHospitalTransport(transcript);
    const keyFindings = this.extractKeyFindings(transcript);
    const summary = this.generateSummary(
      transcript,
      chiefComplaint,
      urgencyLevel,
    );

    return {
      chiefComplaint,
      vitalSigns,
      medications,
      procedures,
      urgencyLevel,
      keyFindings,
      hospitalTransport,
      patientAge,
      patientGender,
      summary,
    };
  }

  private extractMatches(transcript: string, patterns: RegExp[]): string[] {
    const matches = new Set<string>();
    const lowerTranscript = transcript.toLowerCase();

    patterns.forEach((pattern) => {
      const match = lowerTranscript.match(pattern);
      if (match) {
        matches.add(match[0]);
      }
    });

    return Array.from(matches);
  }

  private extractChiefComplaint(transcript: string): string | null {
    const lowerTranscript = transcript.toLowerCase();

    for (const pattern of MedicalAnalysisService.CHIEF_COMPLAINT_PATTERNS) {
      const match = lowerTranscript.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return null;
  }

  private determineUrgencyLevel(
    transcript: string,
  ): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    const lowerTranscript = transcript.toLowerCase();

    // Check for critical keywords first
    for (const keyword of MedicalAnalysisService.URGENCY_KEYWORDS.CRITICAL) {
      if (lowerTranscript.includes(keyword)) {
        return "CRITICAL";
      }
    }

    // Check for high urgency
    for (const keyword of MedicalAnalysisService.URGENCY_KEYWORDS.HIGH) {
      if (lowerTranscript.includes(keyword)) {
        return "HIGH";
      }
    }

    // Check for medium urgency
    for (const keyword of MedicalAnalysisService.URGENCY_KEYWORDS.MEDIUM) {
      if (lowerTranscript.includes(keyword)) {
        return "MEDIUM";
      }
    }

    return "LOW";
  }

  private extractPatientDemographics(transcript: string): {
    patientAge: string | null;
    patientGender: string | null;
  } {
    const ageMatch = transcript.match(/(\d+)\s*year[s]?\s*old|age\s*(\d+)/i);
    const patientAge = ageMatch ? ageMatch[1] || ageMatch[2] : null;

    const genderMatch = transcript.match(/\b(male|female|man|woman)\b/i);
    const patientGender = genderMatch ? genderMatch[1].toLowerCase() : null;

    return { patientAge, patientGender };
  }

  private detectHospitalTransport(transcript: string): boolean {
    const transportKeywords = [
      "transport",
      "transporting",
      "en route",
      "eta",
      "hospital",
      "emergency department",
      "ed",
      "trauma center",
    ];

    const lowerTranscript = transcript.toLowerCase();
    return transportKeywords.some((keyword) =>
      lowerTranscript.includes(keyword),
    );
  }

  private extractKeyFindings(transcript: string): string[] {
    const findings: string[] = [];
    const lowerTranscript = transcript.toLowerCase();

    // Look for specific medical findings
    const findingPatterns = [
      /chest pain|cp/i,
      /shortness of breath|sob/i,
      /altered mental status|ams/i,
      /trauma|injury/i,
      /bleeding|hemorrhage/i,
      /fracture|broken/i,
      /unconscious|unresponsive/i,
      /stable|critical|serious condition/i,
    ];

    findingPatterns.forEach((pattern) => {
      const match = lowerTranscript.match(pattern);
      if (match) {
        findings.push(match[0]);
      }
    });

    return findings;
  }

  private generateSummary(
    transcript: string,
    chiefComplaint: string | null,
    urgencyLevel: string,
  ): string {
    const maxLength = 200;
    let summary = `${urgencyLevel} urgency call`;

    if (chiefComplaint) {
      summary += ` for ${chiefComplaint}`;
    }

    // Add key details from transcript
    const keyDetails = transcript.substring(0, 150);
    summary += `. ${keyDetails}`;

    // Truncate if too long
    if (summary.length > maxLength) {
      summary = summary.substring(0, maxLength - 3) + "...";
    }

    return summary;
  }
}

export const medicalAnalysisService = new MedicalAnalysisService();
