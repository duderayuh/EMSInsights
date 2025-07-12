/**
 * Voice Type Classifier Service
 * Determines if audio is from automated dispatch or human voice based on talkgroup
 */

export class VoiceTypeClassifier {
  // Dispatch talkgroups are automated voice
  private static readonly DISPATCH_TALKGROUPS = ['10202', '10244'];
  
  // Hospital talkgroups are human voice
  private static readonly HOSPITAL_TALKGROUP_RANGE = {
    start: 10255,
    end: 10273
  };

  /**
   * Determine voice type based on talkgroup
   * @param talkgroup - The talkgroup ID as string
   * @returns "automated_voice" for dispatch channels, "human_voice" for hospital channels, null for unknown
   */
  static classifyVoiceType(talkgroup: string | null | undefined): 'automated_voice' | 'human_voice' | null {
    if (!talkgroup) {
      return null;
    }

    // Check if it's a dispatch talkgroup (automated voice)
    if (this.DISPATCH_TALKGROUPS.includes(talkgroup)) {
      return 'automated_voice';
    }

    // Check if it's a hospital talkgroup (human voice)
    const talkgroupNum = parseInt(talkgroup, 10);
    if (!isNaN(talkgroupNum) && 
        talkgroupNum >= this.HOSPITAL_TALKGROUP_RANGE.start && 
        talkgroupNum <= this.HOSPITAL_TALKGROUP_RANGE.end) {
      return 'human_voice';
    }

    // Unknown talkgroup
    return null;
  }

  /**
   * Get human-readable description of voice type
   * @param voiceType - The voice type
   * @returns Human-readable description
   */
  static getVoiceTypeDescription(voiceType: string | null): string {
    switch (voiceType) {
      case 'automated_voice':
        return 'Automated Dispatch';
      case 'human_voice':
        return 'Human Voice';
      default:
        return 'Unknown';
    }
  }

  /**
   * Check if talkgroup is a dispatch channel
   * @param talkgroup - The talkgroup ID
   * @returns true if dispatch channel
   */
  static isDispatchChannel(talkgroup: string | null | undefined): boolean {
    return talkgroup ? this.DISPATCH_TALKGROUPS.includes(talkgroup) : false;
  }

  /**
   * Check if talkgroup is a hospital channel
   * @param talkgroup - The talkgroup ID
   * @returns true if hospital channel
   */
  static isHospitalChannel(talkgroup: string | null | undefined): boolean {
    if (!talkgroup) return false;
    
    const talkgroupNum = parseInt(talkgroup, 10);
    return !isNaN(talkgroupNum) && 
           talkgroupNum >= this.HOSPITAL_TALKGROUP_RANGE.start && 
           talkgroupNum <= this.HOSPITAL_TALKGROUP_RANGE.end;
  }
}