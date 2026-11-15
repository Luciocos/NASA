/**
 * texto alternativo de una gráfica: primero la descripción que escribió quien la usa y
 * después el resumen que se arma con los mismos datos del dibujo
 */
export function chartLabel(description: string | undefined, summary: string): string {
  const lead = description?.trim();
  if (!lead) {
    return summary;
  }
  return /[.!?…]$/.test(lead) ? `${lead} ${summary}` : `${lead}. ${summary}`;
}

/** "1 evento" o "3 eventos": cantidad con su sustantivo en singular o plural */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
