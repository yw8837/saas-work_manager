import Link from "next/link";

import { Brand } from "./brand";
import {
  POLICY_PUBLICATION_MANIFEST,
  getPublicServiceConfig,
  type PolicyBlock,
  type PolicyDocument,
} from "@/lib/policies";

type PolicyPageProps = {
  document: PolicyDocument;
};

function PolicyBlockView({ block }: { block: PolicyBlock }) {
  if (block.type === "paragraph" || block.type === "note") {
    return <p className={block.type === "note" ? "policyNote" : undefined}>{block.text}</p>;
  }
  if (block.type === "list") {
    return <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
  }
  if (block.type === "table") {
    return (
      <div className="policyTableWrap">
        <table>
          <thead><tr>{block.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.join("\u0000")}>
                {row.map((cell, index) => <td key={`${index}:${cell}`}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <p className="policyReferences">
      {block.label}: {block.items.map((item, index) => (
        <span key={item.href}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <a href={item.href}>{item.label}</a>
        </span>
      ))}
    </p>
  );
}

export function PolicyPage({ document }: PolicyPageProps) {
  const service = getPublicServiceConfig();
  const manifest = POLICY_PUBLICATION_MANIFEST;

  return (
    <div className="policyPage">
      <header className="policyHeader">
        <Link href="/" aria-label="일감체크 홈"><Brand /></Link>
        <nav aria-label="정책 메뉴">
          <Link href={manifest.documents.privacy.pathname}>{manifest.documents.privacy.title}</Link>
          <Link href={manifest.documents.terms.pathname}>{manifest.documents.terms.title}</Link>
        </nav>
      </header>

      <main className="policyDocument">
        <p className="policyEyebrow">{document.eyebrow}</p>
        <h1>{document.title}</h1>
        <p className="policyMeta">시행일 {manifest.effectiveDateLabel} · 버전 {document.version}</p>

        {(!service.publicIdentityConfigured || !manifest.finalized) && (
          <aside className="policySetupNotice" role="note">
            <strong>{manifest.shared.draftNoticeTitle}</strong>
            <p>{manifest.shared.draftNoticeBody}</p>
          </aside>
        )}

        <p className="policyLead">{document.lead}</p>

        {document.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.blocks.map((block, index) => (
              <PolicyBlockView key={`${section.heading}:${index}`} block={block} />
            ))}
          </section>
        ))}

        <section>
          <h2>{manifest.shared.operatorHeading}</h2>
          <dl className="policyDefinitionList">
            <div><dt>{manifest.shared.operatorLabel}</dt><dd>{service.operatorName ?? manifest.shared.missingPublicValue}</dd></div>
            <div>
              <dt>{manifest.shared.supportLabel}</dt>
              <dd>
                {service.supportEmail
                  ? <a href={`mailto:${service.supportEmail}`}>{service.supportEmail}</a>
                  : manifest.shared.missingPublicValue}
              </dd>
            </div>
          </dl>
        </section>
      </main>

      <footer className="policyFooter">
        <span>{manifest.shared.footerLabel}</span>
        <Link href="/">홈으로</Link>
      </footer>
    </div>
  );
}
