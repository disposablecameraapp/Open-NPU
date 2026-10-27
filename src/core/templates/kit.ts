/** What every template library shares: languages, the words that stay fixed in a document, the shape of a template. */

export const LANGS = ["en", "fr", "es", "de", "pt", "it"] as const;
export type Lang = (typeof LANGS)[number];

/** Fixed words, "en|fr|es|de|pt|it". A template writes none of its own: the document speaks the language of the request. */
const L: Record<string, string> = {
  summary: "Summary|Résumé|Resumen|Zusammenfassung|Resumo|Riepilogo", contents: "Contents|Sommaire|Contenido|Inhalt|Conteúdo|Indice", introduction: "Introduction|Introduction|Introducción|Einleitung|Introdução|Introduzione",
  conclusion: "Conclusion|Conclusion|Conclusión|Fazit|Conclusão|Conclusione", recommendations: "Recommendations|Recommandations|Recomendaciones|Empfehlungen|Recomendações|Raccomandazioni", sources: "Sources|Sources|Fuentes|Quellen|Fontes|Fonti",
  date: "Date|Date|Fecha|Datum|Data|Data", to: "To|À|Para|An|Para|A", from: "From|De|De|Von|De|Da", subject: "Subject|Objet|Asunto|Betreff|Assunto|Oggetto", cc: "Cc|Copie à|Copia a|Kopie an|Cópia para|In copia a", attachments: "Attachments|Pièces jointes|Adjuntos|Anlagen|Anexos|Allegati",
  regards: "Sincerely|Cordialement|Atentamente|Mit freundlichen Grüßen|Atenciosamente|Cordiali saluti", signature: "Signature|Signature|Firma|Unterschrift|Assinatura|Firma", objectives: "Objectives|Objectifs|Objetivos|Ziele|Objetivos|Obiettivi",
  materials: "Materials|Matériel|Materiales|Material|Materiais|Materiali", steps: "Steps|Étapes|Pasos|Schritte|Etapas|Passaggi", assessment: "Assessment|Évaluation|Evaluación|Bewertung|Avaliação|Valutazione", homework: "Homework|Devoirs|Tarea|Hausaufgaben|Trabalho de casa|Compiti",
  agenda: "Agenda|Ordre du jour|Orden del día|Tagesordnung|Pauta|Ordine del giorno", attendees: "Attendees|Participants|Asistentes|Teilnehmer|Participantes|Partecipanti", absent: "Absent|Absents|Ausentes|Abwesend|Ausentes|Assenti",
  decisions: "Decisions|Décisions|Decisiones|Beschlüsse|Decisões|Decisioni", actions: "Actions|Actions|Acciones|Maßnahmen|Ações|Azioni", owner: "Owner|Responsable|Responsable|Verantwortlich|Responsável|Responsabile", due: "Due|Échéance|Vencimiento|Fällig|Prazo|Scadenza",
  task: "Task|Tâche|Tarea|Aufgabe|Tarefa|Attività", discussion: "Discussion|Discussion|Discusión|Diskussion|Discussão|Discussione", nextMeeting: "Next meeting|Prochaine réunion|Próxima reunión|Nächstes Treffen|Próxima reunião|Prossima riunione",
  place: "Place|Lieu|Lugar|Ort|Local|Luogo", time: "Time|Heure|Hora|Zeit|Hora|Ora", duration: "Duration|Durée|Duración|Dauer|Duração|Durata", level: "Level|Niveau|Nivel|Niveau|Nível|Livello",
  ingredients: "Ingredients|Ingrédients|Ingredientes|Zutaten|Ingredientes|Ingredienti", preparation: "Preparation|Préparation|Preparación|Zubereitung|Preparação|Preparazione", tips: "Tips|Conseils|Consejos|Tipps|Dicas|Consigli", servings: "Servings|Portions|Porciones|Portionen|Porções|Porzioni",
  experience: "Experience|Expérience|Experiencia|Berufserfahrung|Experiência|Esperienza", education: "Education|Formation|Educación|Ausbildung|Formação|Istruzione", skills: "Skills|Compétences|Habilidades|Fähigkeiten|Competências|Competenze",
  languages: "Languages|Langues|Idiomas|Sprachen|Idiomas|Lingue", projects: "Projects|Projets|Proyectos|Projekte|Projetos|Progetti", certificates: "Certifications|Certifications|Certificaciones|Zertifikate|Certificações|Certificazioni", interests: "Interests|Centres d'intérêt|Intereses|Interessen|Interesses|Interessi",
  profile: "Profile|Profil|Perfil|Profil|Perfil|Profilo", contact: "Contact|Contact|Contacto|Kontakt|Contato|Contatto", invoice: "Invoice|Facture|Factura|Rechnung|Fatura|Fattura", quote: "Quote|Devis|Presupuesto|Angebot|Orçamento|Preventivo",
  number: "Number|Numéro|Número|Nummer|Número|Numero", dueDate: "Due date|Date d'échéance|Fecha de vencimiento|Fälligkeitsdatum|Data de vencimento|Data di scadenza", description: "Description|Description|Descripción|Beschreibung|Descrição|Descrizione",
  qty: "Qty|Qté|Cant.|Menge|Qtd|Q.tà", unitPrice: "Unit price|Prix unitaire|Precio unitario|Einzelpreis|Preço unitário|Prezzo unitario", amount: "Amount|Montant|Importe|Betrag|Valor|Importo",
  subtotal: "Subtotal|Sous-total|Subtotal|Zwischensumme|Subtotal|Subtotale", tax: "Tax|TVA|IVA|MwSt.|Imposto|IVA", total: "Total|Total|Total|Gesamt|Total|Totale", terms: "Terms|Conditions|Condiciones|Bedingungen|Condições|Condizioni", payment: "Payment|Paiement|Pago|Zahlung|Pagamento|Pagamento",
  client: "Client|Client|Cliente|Kunde|Cliente|Cliente", scope: "Scope|Périmètre|Alcance|Umfang|Escopo|Ambito", timeline: "Timeline|Calendrier|Cronograma|Zeitplan|Cronograma|Cronologia", pricing: "Pricing|Tarifs|Precios|Preise|Preços|Prezzi",
  phase: "Phase|Phase|Fase|Phase|Fase|Fase", deliverable: "Deliverable|Livrable|Entregable|Ergebnis|Entregável|Consegna", problem: "Problem|Problème|Problema|Problem|Problema|Problema", solution: "Solution|Solution|Solución|Lösung|Solução|Soluzione",
  nextSteps: "Next steps|Prochaines étapes|Próximos pasos|Nächste Schritte|Próximos passos|Prossimi passi", risks: "Risks|Risques|Riesgos|Risiken|Riscos|Rischi", risk: "Risk|Risque|Riesgo|Risiko|Risco|Rischio", impact: "Impact|Impact|Impacto|Auswirkung|Impacto|Impatto",
  mitigation: "Mitigation|Parade|Mitigación|Gegenmaßnahme|Mitigação|Mitigazione", milestones: "Milestones|Jalons|Hitos|Meilensteine|Marcos|Traguardi", budget: "Budget|Budget|Presupuesto|Budget|Orçamento|Budget", stakeholders: "Stakeholders|Parties prenantes|Partes interesadas|Stakeholder|Partes interessadas|Parti interessate",
  goals: "Goals|Objectifs|Metas|Ziele|Metas|Obiettivi", nonGoals: "Non-goals|Hors périmètre|Fuera de alcance|Nicht-Ziele|Fora do escopo|Fuori ambito", users: "Users|Utilisateurs|Usuarios|Nutzer|Usuários|Utenti", requirements: "Requirements|Exigences|Requisitos|Anforderungen|Requisitos|Requisiti",
  priority: "Priority|Priorité|Prioridad|Priorität|Prioridade|Priorità", metrics: "Metrics|Indicateurs|Métricas|Kennzahlen|Métricas|Metriche", openQuestions: "Open questions|Questions ouvertes|Preguntas abiertas|Offene Fragen|Perguntas em aberto|Domande aperte",
  purpose: "Purpose|Objet|Propósito|Zweck|Finalidade|Scopo", roles: "Roles|Rôles|Roles|Rollen|Papéis|Ruoli", revision: "Revision history|Historique des révisions|Historial de revisiones|Änderungshistorie|Histórico de revisões|Cronologia delle revisioni",
  about: "About|À propos|Acerca de|Über|Sobre|Informazioni su", pressContact: "Press contact|Contact presse|Contacto de prensa|Pressekontakt|Contato de imprensa|Contatto stampa", parties: "Parties|Parties|Partes|Parteien|Partes|Parti", clauses: "Clauses|Clauses|Cláusulas|Klauseln|Cláusulas|Clausole",
  signatures: "Signatures|Signatures|Firmas|Unterschriften|Assinaturas|Firme", notes: "Notes|Notes|Notas|Notizen|Notas|Note", keyTerms: "Key terms|Termes clés|Términos clave|Schlüsselbegriffe|Termos-chave|Termini chiave", term: "Term|Terme|Término|Begriff|Termo|Termine",
  definition: "Definition|Définition|Definición|Definition|Definição|Definizione", day: "Day|Jour|Día|Tag|Dia|Giorno", program: "Program|Programme|Programa|Programm|Programa|Programma", speaker: "Speaker|Intervenant|Ponente|Referent|Palestrante|Relatore",
  session: "Session|Session|Sesión|Sitzung|Sessão|Sessione", itinerary: "Itinerary|Itinéraire|Itinerario|Reiseplan|Roteiro|Itinerario", overview: "Overview|Vue d'ensemble|Resumen general|Überblick|Visão geral|Panoramica", background: "Background|Contexte|Contexto|Hintergrund|Contexto|Contesto",
  findings: "Findings|Constats|Hallazgos|Ergebnisse|Constatações|Risultati", analysis: "Analysis|Analyse|Análisis|Analyse|Análise|Analisi", appendix: "Appendix|Annexes|Anexos|Anhang|Apêndice|Appendice", abstract: "Abstract|Résumé|Resumen|Zusammenfassung|Resumo|Abstract",
  keywords: "Keywords|Mots-clés|Palabras clave|Schlüsselwörter|Palavras-chave|Parole chiave", references: "References|Références|Referencias|Literatur|Referências|Riferimenti", name: "Name|Nom|Nombre|Name|Nome|Nome", role: "Role|Rôle|Cargo|Rolle|Função|Ruolo",
  status: "Status|Statut|Estado|Status|Status|Stato", author: "Author|Auteur|Autor|Autor|Autor|Autore", edition: "Edition|Numéro|Edición|Ausgabe|Edição|Edizione", events: "Upcoming events|À venir|Próximos eventos|Kommende Termine|Próximos eventos|Prossimi eventi",
  mainPoints: "Key points|Points clés|Puntos clave|Kernpunkte|Pontos-chave|Punti chiave", options: "Options|Options|Opciones|Optionen|Opções|Opzioni", pros: "Pros|Avantages|Ventajas|Vorteile|Vantagens|Vantaggi", cons: "Cons|Inconvénients|Desventajas|Nachteile|Desvantagens|Svantaggi",
  facts: "Facts|Faits|Hechos|Fakten|Fatos|Fatti", causes: "Causes|Causes|Causas|Ursachen|Causas|Cause", lessons: "Lessons learned|Enseignements|Lecciones aprendidas|Erkenntnisse|Lições aprendidas|Lezioni apprese", location: "Location|Lieu|Ubicación|Ort|Local|Luogo",
  venue: "Venue|Lieu|Lugar|Veranstaltungsort|Local|Sede", price: "Price|Prix|Precio|Preis|Preço|Prezzo", validity: "Valid until|Valable jusqu'au|Válido hasta|Gültig bis|Válido até|Valido fino al", questions: "Questions|Questions|Preguntas|Fragen|Perguntas|Domande"
};
const TABLE = new Map(Object.entries(L).map(([k, v]) => [k, v.split("|")]));
export const label = (lang: Lang, key: string): string => TABLE.get(key)?.[LANGS.indexOf(lang)] ?? TABLE.get(key)?.[0] ?? key;

const STOP: Record<Lang, RegExp> = {
  en: /\b(the|and|for|with|my|please|make|create|write|that|this|from|about|of)\b/gi, fr: /\b(le|la|les|des|une|pour|avec|mon|ma|mes|fais|fais-moi|crée|cr[ée]er|rédige|sur|un|du|et|est)\b/gi,
  es: /\b(el|los|las|una|para|con|mi|mis|haz|crea|escribe|sobre|un|del|y|es)\b/gi, de: /\b(der|die|das|und|für|mit|mein|meine|erstelle|schreibe|ein|eine|über|ist)\b/gi,
  pt: /\b(o|os|as|uma|para|com|meu|minha|faça|crie|escreva|sobre|um|do|da|e|é)\b/gi, it: /\b(il|lo|gli|le|una|per|con|mio|mia|fai|crea|scrivi|su|un|del|e|è)\b/gi
};
/** The language of a request, by its small words; English when nothing is clear. */
export function langOf(text: string): Lang {
  let best: { l: Lang; n: number } = { l: "en", n: 0 };
  for (const l of LANGS) { const n = (text.match(STOP[l]) ?? []).length; if (n > best.n + (l === "en" ? 0 : 0)) best = { l, n }; }
  return best.l;
}

export type TemplateKind = "docx" | "xlsx" | "site" | "tool";
export interface TemplateInfo { id: string; kind: TemplateKind; name: string; summary: string; words: RegExp }
export interface Rendered { source: string; title: string }
export interface Template extends TemplateInfo {
  /** More instructions for the model that fills this template (the icon names a site may use). */
  hint?: string;
  /** JSON schema of the data the model fills in (always closed: no field the template does not know). */
  schema: object;
  /** What is wrong with the data, in words the model can act on. */
  problems(data: unknown): string[];
  /** `live`: the data is still being written, so only what is there is drawn (no empty rows or sheets waiting to be filled). */
  render(data: unknown, opts?: { live?: boolean }): Rendered;
}
export const schemaStr = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
export const schemaStrs = (description?: string) => ({ type: "array", items: { type: "string" }, maxItems: 30, ...(description ? { description } : {}) });
export const asText = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
export const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(asText).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : []);
export const asRows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
export const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
