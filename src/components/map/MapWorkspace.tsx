import { useId, useState, type ReactNode } from 'react';
import { Route, SlidersHorizontal, Users, X } from 'lucide-react';
import './live-map.css';

export default function MapWorkspace({ children, panel, routes, tools, title = 'Group panel', open: controlledOpen, onOpenChange }: {
  children: ReactNode;
  panel: ReactNode;
  routes?: ReactNode;
  tools?: ReactNode;
  title?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const [extraPanel, setExtraPanel] = useState<'routes' | 'tools' | null>(null);
  const open = controlledOpen ?? localOpen;
  const id = useId();
  const activePanel = open && panel != null ? 'groups' : extraPanel;
  const setOpen = (value: boolean) => { setLocalOpen(value); onOpenChange?.(value); };
  const close = () => { setOpen(false); setExtraPanel(null); };
  const toggleExtra = (value: 'routes' | 'tools') => { setOpen(false); setExtraPanel(activePanel === value ? null : value); };
  return (
    <div className="live-map-workspace" data-panel-open={Boolean(activePanel)} onKeyDown={event => {
      if (event.key === 'Escape' && activePanel) { close(); event.stopPropagation(); }
    }}>
      <div className="live-map-canvas">{children}</div>
      <aside id={id} className="live-map-panel" aria-label={activePanel === 'groups' ? title : activePanel === 'routes' ? 'Routes' : 'Tools'} hidden={!activePanel}>
        <div className="live-map-panel-heading">
          <strong>{activePanel === 'groups' ? title : activePanel === 'routes' ? 'Routes' : 'Tools'}</strong>
          <button type="button" className="live-map-icon" aria-label="Close map panel" title="Close panel" onClick={close}><X size={18} /></button>
        </div>
        <div className="live-map-panel-body" hidden={activePanel !== 'groups'}>{panel}</div>
        <div className="live-map-panel-body" hidden={activePanel !== 'routes'}>{routes ?? <p className="live-map-empty">No published routes available.</p>}</div>
        <div className="live-map-panel-body" hidden={activePanel !== 'tools'}>{tools ?? <p className="live-map-empty">Use the zoom and locate controls on the map.</p>}</div>
      </aside>
      <nav className="live-map-dock" aria-label="Map dock">
        <button type="button" disabled={panel == null} aria-expanded={activePanel === 'groups'} aria-controls={id}
          aria-label={`${activePanel === 'groups' ? 'Collapse' : 'Expand'} ${title.toLowerCase()}`} title={title}
          onClick={() => { setExtraPanel(null); setOpen(!open); }}><Users size={19} /><span>{title === 'My hike' ? 'My hike' : 'Groups'}</span></button>
        <button type="button" aria-expanded={activePanel === 'routes'} aria-controls={id} title="Routes" onClick={() => toggleExtra('routes')}><Route size={19} /><span>Routes</span></button>
        <button type="button" aria-expanded={activePanel === 'tools'} aria-controls={id} title="Tools" onClick={() => toggleExtra('tools')}><SlidersHorizontal size={19} /><span>Tools</span></button>
      </nav>
    </div>
  );
}
