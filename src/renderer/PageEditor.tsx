import { useMemo } from "react";
import { Puck, type Data } from "@measured/puck";
import "@measured/puck/no-external.css";
import { fromPuckData, toPuckData, type PageSpec } from "../core/page/catalog";
import { pageConfig } from "../core/page/blocks";
import { pageToHtml } from "../core/page/html";

/**
 * The visual editor of a page made from blocks (Puck, MIT): drag blocks, change their fields, add or remove sections, with the
 * page drawn live. The page is the same description the model wrote, so what is saved here can be changed by the model again.
 */
export default function PageEditor({ spec, onSave, onClose }: { spec: PageSpec; onSave: (html: string) => void; onClose: () => void }) {
  const config = useMemo(() => pageConfig(spec), [spec]);
  const data = useMemo(() => toPuckData(spec) as unknown as Data, [spec]);
  return (
    <div className="page-editor" role="dialog" aria-label="Edit the page's blocks">
      <Puck
        config={config}
        data={data}
        headerTitle={spec.title || "Page"}
        headerPath="blocks"
        onPublish={(d) => { onSave(pageToHtml({ ...fromPuckData(d as never), nav: spec.nav, current: spec.current })); onClose(); }}
        overrides={{ headerActions: ({ children }) => <><button type="button" className="linkbtn" onClick={onClose}>Cancel</button>{children}</> }}
      />
    </div>
  );
}
