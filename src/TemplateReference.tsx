import { Eye } from "lucide-react";
import { GardenPreview } from "./community/GardenPreview";
import type { GardenTemplate } from "./game/templates";

export function TemplateReference({ template }: { template: GardenTemplate }) {
  return (
    <aside className="template-reference" aria-label={`范例参照：${template.name}`}>
      <header>
        <div>
          <small>范例参照</small>
          <strong>{template.name}</strong>
        </div>
        <Eye aria-hidden="true" />
      </header>
      <div className="template-reference-stage">
        <GardenPreview
          garden={template.garden}
          environment={template.environment}
          still
        />
      </div>
      <footer>
        <span>{template.style}</span>
        <span>{template.garden.size} × {template.garden.size}</span>
      </footer>
    </aside>
  );
}
