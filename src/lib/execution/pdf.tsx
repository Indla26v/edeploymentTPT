/* eslint-disable jsx-a11y/alt-text -- React-PDF <Image> draws into a PDF, not an HTML img */
import "server-only";

import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";

import { readLocalFile } from "../storage";

// Never insert hyphens into names: break lines at spaces only.
Font.registerHyphenationCallback((word) => [word]);

/** An image React-PDF can draw: local uploads are read from disk; WebP isn't supported by the PDF engine. */
export type PdfImage = { data: Buffer; format: "png" | "jpg" } | string | null;

export async function pdfImage(url: string | null | undefined): Promise<PdfImage> {
  if (!url) return null;
  if (url.startsWith("/api/files/")) {
    const f = await readLocalFile(url.replace("/api/files/", "").split("/"));
    if (!f || f.type === "image/webp") return null;
    return { data: f.data, format: f.type === "image/png" ? "png" : "jpg" };
  }
  return /\.webp(\?|$)/i.test(url) ? null : url;
}

export const qrDataUrl = (text: string) => QRCode.toDataURL(text, { margin: 0, width: 240, errorCorrectionLevel: "M" });

export const THEMES = { blue: "#1e3a8a", green: "#166534", maroon: "#7f1d1d", black: "#111827" } as const;
export type Theme = keyof typeof THEMES;

const s = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: "Helvetica", color: "#111827" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { width: 260, height: 150, borderRadius: 10, borderWidth: 1, borderColor: "#cbd5e1", overflow: "hidden" },
  cardLarge: { width: 360, height: 210 },
  head: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 6 },
  headTitle: { color: "white", fontSize: 9, fontFamily: "Helvetica-Bold" },
  headSub: { color: "white", fontSize: 7, opacity: 0.85 },
  logo: { width: 22, height: 22, borderRadius: 11, backgroundColor: "white" },
  body: { flexDirection: "row", padding: 8, gap: 8, flexGrow: 1 },
  photo: { width: 52, height: 64, borderRadius: 4, backgroundColor: "#e2e8f0", alignItems: "center", justifyContent: "center" },
  name: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  line: { fontSize: 7.5, marginBottom: 1.5, color: "#334155" },
  label: { color: "#64748b" },
  qr: { width: 58, height: 58 },
  foot: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 6 },
  sig: { width: 60, height: 18, objectFit: "contain" },
  small: { fontSize: 6.5, color: "#64748b" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  h3: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 2 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 2.5 },
  cell: { paddingRight: 6 },
  pass: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 12 },
});

export type CardData = {
  name: string;
  rank: string;
  genNo: string;
  station: string;
  posting: string;
  sector: string;
  component: string;
  batch: number | null;
  photo: PdfImage;
  qr: string;
};
export type Branding = { unit: string; title: string; logo: PdfImage; signature: PdfImage; officerName: string; officerDesignation: string; theme: Theme };

function initials(n: string) {
  return n
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function IdCard({ c, b, large }: { c: CardData; b: Branding; large: boolean }) {
  return (
    <View style={[s.card, large ? s.cardLarge : {}]} wrap={false}>
      <View style={[s.head, { backgroundColor: THEMES[b.theme] }]}>
        {b.logo ? <Image src={b.logo} style={s.logo} /> : <View style={s.logo} />}
        <View>
          <Text style={s.headTitle}>{b.unit}</Text>
          <Text style={s.headSub}>{b.title}</Text>
        </View>
      </View>
      <View style={s.body}>
        <View style={s.photo}>{c.photo ? <Image src={c.photo} style={{ width: 52, height: 64, borderRadius: 4, objectFit: "cover" }} /> : <Text style={{ fontSize: 16, color: "#64748b" }}>{initials(c.name)}</Text>}</View>
        <View style={{ flex: 1, flexBasis: 0, minWidth: 0 }}>
          <Text style={[s.name, c.name.length > 24 ? { fontSize: 8.5 } : {}]}>{c.name}</Text>
          <Text style={s.line}>
            <Text style={s.label}>Rank </Text>
            {c.rank} · <Text style={s.label}>Gen No </Text>
            {c.genNo}
          </Text>
          <Text style={s.line}>
            <Text style={s.label}>Station </Text>
            {c.station}
          </Text>
          <Text style={[s.line, { fontFamily: "Helvetica-Bold", color: "#111827" }]}>{c.posting}</Text>
          <Text style={s.line}>
            {c.component} › {c.sector}
            {c.batch ? ` · Batch ${c.batch}` : ""}
          </Text>
        </View>
        <Image src={c.qr} style={s.qr} />
      </View>
      <View style={s.foot}>
        <Text style={s.small}>Scan to check in / out</Text>
        <View style={{ alignItems: "center" }}>
          {b.signature ? <Image src={b.signature} style={s.sig} /> : null}
          <Text style={s.small}>
            {b.officerName}
            {b.officerDesignation ? `, ${b.officerDesignation}` : ""}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function renderIdCards(cards: CardData[], b: Branding, layout: 1 | 6) {
  const per = layout === 1 ? 1 : 6;
  const pages: CardData[][] = [];
  for (let i = 0; i < cards.length; i += per) pages.push(cards.slice(i, i + per));
  return renderToBuffer(
    <Document title={`${b.title} — ID cards`}>
      {pages.map((p, i) => (
        <Page key={i} size="A4" style={s.page}>
          <View style={[s.grid, layout === 1 ? { justifyContent: "center", marginTop: 120 } : {}]}>
            {p.map((c, j) => (
              <IdCard key={j} c={c} b={b} large={layout === 1} />
            ))}
          </View>
        </Page>
      ))}
    </Document>,
  );
}

export type PassData = CardData & { dates: string; venue: string; schedule: { kind: string; at: string; place: string }[]; instructions: string | null };

export function renderDutyPasses(passes: PassData[], b: Branding, planTitle: string) {
  return renderToBuffer(
    <Document title={`${planTitle} — duty passes`}>
      <Page size="A4" style={s.page}>
        {passes.map((p, i) => (
          <View key={i} style={s.pass} wrap={false}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={[s.small, { color: THEMES[b.theme], fontFamily: "Helvetica-Bold" }]}>{b.unit.toUpperCase()} · DUTY PASS</Text>
                <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", marginVertical: 2 }}>{planTitle}</Text>
                <Text style={s.line}>
                  {p.dates}
                  {p.venue ? ` · ${p.venue}` : ""}
                </Text>
              </View>
              <Image src={p.qr} style={{ width: 54, height: 54 }} />
            </View>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
              <View style={{ width: "45%" }}>
                <Text style={s.name}>
                  {p.rank} {p.name}
                </Text>
                <Text style={s.line}>
                  Gen No {p.genNo} · {p.station}
                </Text>
                <Text style={[s.line, { fontFamily: "Helvetica-Bold", color: "#111827", marginTop: 4 }]}>Posting: {p.posting}</Text>
                <Text style={s.line}>
                  {p.component} › {p.sector}
                  {p.batch ? ` · Batch ${p.batch}` : ""}
                </Text>
              </View>
              <View style={{ flexGrow: 1 }}>
                {p.schedule.map((r, j) => (
                  <Text key={j} style={s.line}>
                    <Text style={{ fontFamily: "Helvetica-Bold" }}>{r.kind}</Text> {r.at} — {r.place}
                  </Text>
                ))}
              </View>
            </View>
            {p.instructions ? <Text style={[s.line, { marginTop: 6 }]}>Instructions: {p.instructions}</Text> : null}
            <View style={{ alignItems: "flex-end", marginTop: 4 }}>
              {b.signature ? <Image src={b.signature} style={s.sig} /> : null}
              <Text style={s.small}>
                {b.officerName}
                {b.officerDesignation ? `, ${b.officerDesignation}` : ""}
              </Text>
            </View>
          </View>
        ))}
      </Page>
    </Document>,
  );
}

export type SchemeBook = {
  unit: string;
  about: string | null;
  logo: PdfImage;
  title: string;
  code: string;
  dates: string;
  venue: string;
  overall: string | null;
  schedule: { kind: string; at: string; place: string; rank: string }[];
  components: {
    name: string;
    co: string;
    sectors: { name: string; instructions: string | null; officers: { posting: string; batch: number | null; rank: string; name: string; station: string; phone: string | null }[] }[];
  }[];
  totals: { rank: string; n: number }[];
};

export function renderSchemeBook(b: SchemeBook) {
  return renderToBuffer(
    <Document title={`${b.title} — scheme book`}>
      <Page size="A4" style={[s.page, { justifyContent: "center", alignItems: "center" }]}>
        {b.logo ? <Image src={b.logo} style={{ width: 72, height: 72, marginBottom: 16 }} /> : null}
        <Text style={{ fontSize: 11, color: "#475569" }}>{b.unit}</Text>
        <Text style={{ fontSize: 26, fontFamily: "Helvetica-Bold", marginVertical: 8, textAlign: "center" }}>{b.title}</Text>
        <Text style={{ fontSize: 12 }}>BANDOBAST SCHEME</Text>
        <Text style={{ fontSize: 10, marginTop: 10, color: "#475569" }}>
          {b.dates}
          {b.venue ? ` · ${b.venue}` : ""}
        </Text>
        <Text style={{ fontSize: 9, marginTop: 4, color: "#64748b" }}>{b.code}</Text>
        {b.about ? <Text style={{ fontSize: 9, marginTop: 40, maxWidth: 360, textAlign: "center", color: "#475569" }}>{b.about}</Text> : null}
      </Page>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Abstract</Text>
        {b.overall ? <Text style={s.line}>Overall Incharge: {b.overall}</Text> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 6 }}>
          {b.totals.map((t) => (
            <Text key={t.rank} style={{ borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }}>
              {t.rank}: {t.n}
            </Text>
          ))}
        </View>
        {b.schedule.length > 0 && <Text style={s.h2}>Reporting schedule</Text>}
        {b.schedule.map((r, i) => (
          <View key={i} style={s.row}>
            <Text style={[s.cell, { width: 90, fontFamily: "Helvetica-Bold" }]}>{r.kind}</Text>
            <Text style={[s.cell, { width: 110 }]}>{r.at}</Text>
            <Text style={[s.cell, { width: 60 }]}>{r.rank}</Text>
            <Text style={s.cell}>{r.place}</Text>
          </View>
        ))}
        {b.components.map((c) => (
          <View key={c.name} break>
            <Text style={s.h1}>{c.name}</Text>
            <Text style={s.line}>Component Officer: {c.co}</Text>
            {c.sectors.map((sec) => (
              <View key={sec.name}>
                <Text style={s.h2}>{sec.name}</Text>
                {sec.instructions ? <Text style={[s.line, { marginBottom: 4 }]}>{sec.instructions}</Text> : null}
                {sec.officers.map((o, i) => (
                  <View key={i} style={s.row} wrap={false}>
                    <Text style={[s.cell, { width: 150 }]}>
                      {o.posting}
                      {o.batch ? ` (B${o.batch})` : ""}
                    </Text>
                    <Text style={[s.cell, { width: 40 }]}>{o.rank}</Text>
                    <Text style={[s.cell, { width: 150 }]}>{o.name}</Text>
                    <Text style={[s.cell, { width: 100 }]}>{o.station}</Text>
                    <Text style={s.cell}>{o.phone ?? ""}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>,
  );
}
