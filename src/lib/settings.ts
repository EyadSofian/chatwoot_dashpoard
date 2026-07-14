import { prisma } from "@/lib/db";
import { env } from "@/env";
import { parseClockMinutes, type BusinessHoursConfig } from "@/lib/time";

export interface SlaSettings {
  firstResponseMinutes: number;
  resolutionHours: number;
  nearBreachRatio: number;
  businessHours: {
    timezone: string;
    start: string; // "09:00"
    end: string; // "22:00"
    days: number[];
  };
}

const SLA_KEY = "sla";

export function slaDefaultsFromEnv(): SlaSettings {
  return {
    firstResponseMinutes: env.slaFirstResponseMinutes(),
    resolutionHours: env.slaResolutionHours(),
    nearBreachRatio: 0.8,
    businessHours: {
      timezone: env.timezone(),
      start: env.businessStart(),
      end: env.businessEnd(),
      days: env.businessDays(),
    },
  };
}

/** Load SLA settings: DB override merged over env defaults. */
export async function getSlaSettings(): Promise<SlaSettings> {
  const defaults = slaDefaultsFromEnv();
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SLA_KEY } });
    if (!row) return defaults;
    const saved = row.value as Partial<SlaSettings>;
    return {
      firstResponseMinutes: saved.firstResponseMinutes ?? defaults.firstResponseMinutes,
      resolutionHours: saved.resolutionHours ?? defaults.resolutionHours,
      nearBreachRatio: saved.nearBreachRatio ?? defaults.nearBreachRatio,
      businessHours: {
        timezone: saved.businessHours?.timezone ?? defaults.businessHours.timezone,
        start: saved.businessHours?.start ?? defaults.businessHours.start,
        end: saved.businessHours?.end ?? defaults.businessHours.end,
        days: saved.businessHours?.days ?? defaults.businessHours.days,
      },
    };
  } catch {
    return defaults;
  }
}

export interface SlaSettingsPatch {
  firstResponseMinutes?: number;
  resolutionHours?: number;
  nearBreachRatio?: number;
  businessHours?: Partial<SlaSettings["businessHours"]>;
}

export async function saveSlaSettings(patch: SlaSettingsPatch): Promise<SlaSettings> {
  const current = await getSlaSettings();
  const merged: SlaSettings = {
    firstResponseMinutes: patch.firstResponseMinutes ?? current.firstResponseMinutes,
    resolutionHours: patch.resolutionHours ?? current.resolutionHours,
    nearBreachRatio: patch.nearBreachRatio ?? current.nearBreachRatio,
    businessHours: {
      timezone: patch.businessHours?.timezone ?? current.businessHours.timezone,
      start: patch.businessHours?.start ?? current.businessHours.start,
      end: patch.businessHours?.end ?? current.businessHours.end,
      days: patch.businessHours?.days ?? current.businessHours.days,
    },
  };
  await prisma.appSetting.upsert({
    where: { key: SLA_KEY },
    create: { key: SLA_KEY, value: merged as unknown as object },
    update: { value: merged as unknown as object },
  });
  return merged;
}

export function businessConfig(sla: SlaSettings): BusinessHoursConfig {
  return {
    timezone: sla.businessHours.timezone,
    startMinutes: parseClockMinutes(sla.businessHours.start, 9 * 60),
    endMinutes: parseClockMinutes(sla.businessHours.end, 22 * 60),
    days: sla.businessHours.days,
  };
}
