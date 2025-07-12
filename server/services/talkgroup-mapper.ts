/**
 * Talkgroup Mapping Service for Indianapolis-Marion County EMS
 * Maps talkgroup IDs to descriptive names for better call identification
 */

interface TalkgroupMapping {
  id: string;
  description: string;
  category: "dispatch" | "fire" | "ems" | "police" | "interop";
  system: string;
}

export class TalkgroupMapper {
  private static readonly MESA_TALKGROUPS: TalkgroupMapping[] = [
    // Emergency Dispatch Channels
    {
      id: "10202",
      description: "Fire/EMS Dispatch Primary",
      category: "dispatch",
      system: "MESA",
    },
    {
      id: "10244",
      description: "Fire/EMS Dispatch Secondary",
      category: "dispatch",
      system: "MESA",
    },

    // Fire/EMS Operations
    {
      id: "10203",
      description: "Operations North",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10204",
      description: "Operations South",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10205",
      description: "Operations 01",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10206",
      description: "Operations 02",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10207",
      description: "Operations 03",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10208",
      description: "Operations 04",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10209",
      description: "Operations 05",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10210",
      description: "Operations 06",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10211",
      description: "Operations 07",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10212",
      description: "Operations 08",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10213",
      description: "Operations 09",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10214",
      description: "Operations 10",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10215",
      description: "Operations 11",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10216",
      description: "Operations 12",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10217",
      description: "Operations 13",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10218",
      description: "Operations 14",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10219",
      description: "Operations 15",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10220",
      description: "Operations 16",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10221",
      description: "Operations 17",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10222",
      description: "Operations 18",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10223",
      description: "Operations 19",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10224",
      description: "Operations 20",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10225",
      description: "Operations 21 (Training/Reserve)",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10226",
      description: "Operations 22 (Training/Reserve)",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10227",
      description: "Operations 23 (Training/Reserve)",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10228",
      description: "Operations 24 (Training/Reserve)",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10229",
      description: "Operations 25 (Training/Reserve)",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10230",
      description: "Operations 26 (Training/Reserve)",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10231",
      description: "Operations 27 (Training/Reserve)",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10232",
      description: "Operations 28 (Training/Reserve)",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10233",
      description: "Operations 29 (Training/Reserve)",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10234",
      description: "Operations 30 (Training/Reserve)",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10241",
      description: "Countywide Car-to-Car",
      category: "fire/EMS",
      system: "MESA",
    },
    {
      id: "10279",
      description: "Special Investigations",
      category: "fire/EMS",
      system: "MESA",
    },

    // EMS-Hospital Communications
    {
      id: "10254",
      description: "Countywide IHERN Patch",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10255",
      description: "Med 02 - Eskenazi",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10256",
      description: "Med 03 - IU Methodist",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10257",
      description: "Med 04 - Community East",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10258",
      description: "Med 05 - IU Riley",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10259",
      description: "Med 06 - St. V - 86th Street ER Primary",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10260",
      description: "Med 07 - St. V - Castleton",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10261",
      description: "Med 08 - Community North",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10262",
      description: "Med 09 - Community South",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10263",
      description: "Med 10 - Community West",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10264",
      description: "Med 11 - IU University",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10265",
      description: "Med 12 - St. V - Peyton Manning Children's",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10266",
      description: "Med 13 - Franciscan South",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10267",
      description: "Med 14 - IU North",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10268",
      description: "Med 15 - Franciscan North",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10269",
      description: "Med 16 - Community Heart and Vascular",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10270",
      description: "Med 17 - VA",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10271",
      description: "Med 18 - Hendricks Regional",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10272",
      description: "Med 19 - St. Vincent's - Carmel",
      category: "hospital",
      system: "MESA",
    },
    {
      id: "10273",
      description: "Med 20 - Spare",
      category: "hospital",
      system: "MESA",
    },

    // Lawrence Fire & EMS
    {
      id: "10402",
      description: "Lawrence Fire Dispatch",
      category: "dispatch",
      system: "MESA",
    },
    {
      id: "10403",
      description: "Lawrence EMS Operations",
      category: "ems",
      system: "MESA",
    },
    {
      id: "10404",
      description: "Lawrence Fire Operations 1",
      category: "fire",
      system: "MESA",
    },
    {
      id: "10407",
      description: "Lawrence Fire Administration",
      category: "fire",
      system: "MESA",
    },
    {
      id: "10408",
      description: "Lawrence Fire Special Operations",
      category: "fire",
      system: "MESA",
    },
    {
      id: "10409",
      description: "Lawrence Fire Training",
      category: "fire",
      system: "MESA",
    },
    {
      id: "10410",
      description: "Lawrence Fire Control",
      category: "fire",
      system: "MESA",
    },
    {
      id: "10652",
      description: "Lawrence Fire Operations",
      category: "fire",
      system: "MESA",
    },
  ];

  private talkgroupMap: Map<string, TalkgroupMapping>;

  constructor() {
    this.talkgroupMap = new Map();
    this.loadTalkgroups();
  }

  private loadTalkgroups() {
    TalkgroupMapper.MESA_TALKGROUPS.forEach((tg) => {
      this.talkgroupMap.set(tg.id, tg);
    });
  }

  /**
   * Get talkgroup description by ID
   */
  getDescription(talkgroupId: string | number): string {
    const id = String(talkgroupId);
    const mapping = this.talkgroupMap.get(id);

    if (mapping) {
      return mapping.description;
    }

    // Fallback for unknown talkgroups
    return `Talkgroup ${id}`;
  }

  /**
   * Get talkgroup category by ID
   */
  getCategory(talkgroupId: string | number): string {
    const id = String(talkgroupId);
    const mapping = this.talkgroupMap.get(id);
    return mapping?.category || "unknown";
  }

  /**
   * Get full talkgroup info by ID
   */
  getTalkgroupInfo(talkgroupId: string | number): TalkgroupMapping | null {
    const id = String(talkgroupId);
    return this.talkgroupMap.get(id) || null;
  }

  /**
   * Get all talkgroups for a specific category
   */
  getTalkgroupsByCategory(category: string): TalkgroupMapping[] {
    return TalkgroupMapper.MESA_TALKGROUPS.filter(
      (tg) => tg.category === category,
    );
  }

  /**
   * Get formatted display name with category indicator
   */
  getDisplayName(talkgroupId: string | number): string {
    const id = String(talkgroupId);
    const mapping = this.talkgroupMap.get(id);

    if (mapping) {
      const categoryIndicator = this.getCategoryIndicator(mapping.category);
      return `${categoryIndicator} ${mapping.description}`;
    }

    return `📻 Talkgroup ${id}`;
  }

  private getCategoryIndicator(category: string): string {
    switch (category) {
      case "dispatch":
        return "📞";
      case "fire":
        return "🚒";
      case "ems":
        return "🚑";
      case "police":
        return "👮";
      case "interop":
        return "🤝";
      default:
        return "📻";
    }
  }

  /**
   * Check if talkgroup ID is monitored by EMS-Insight
   */
  isMonitored(talkgroupId: string | number): boolean {
    const id = String(talkgroupId);
    return this.talkgroupMap.has(id);
  }
}

export const talkgroupMapper = new TalkgroupMapper();
