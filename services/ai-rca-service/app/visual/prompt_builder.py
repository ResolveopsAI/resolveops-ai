"""
Image Prompt Builder — ResolveOps AI.

Converts a validated VisualSpec into a detailed DALL-E 3 image prompt.

The prompt is dynamically generated from the spec's components, sections,
and relationships.  No hardcoded technology names (Kubernetes, AWS, etc.)
are baked into the template.
"""
from __future__ import annotations

from app.visual.schemas import VisualSpec


def build_image_prompt(spec: VisualSpec) -> str:
    """
    Build a detailed image generation prompt from a validated VisualSpec.

    The resulting prompt is stored on spec.image_prompt for logging and auditing.
    The prompt is never exposed in API responses.
    """
    # ── Canvas and style ──────────────────────────────────────────────────────
    orientation_rule = (
        "Wide landscape composition (16:9 ratio) with a clear left-to-right information flow."
        if spec.orientation == "landscape"
        else "Portrait composition (9:16 ratio) with a clear top-to-bottom information flow."
    )

    # ── Sections block ────────────────────────────────────────────────────────
    sections_text_parts = []
    for section in spec.sections:
        comp_names = [c.label for c in section.components]
        if comp_names:
            sections_text_parts.append(
                f"  Section '{section.label}': {', '.join(comp_names)}"
            )
        else:
            sections_text_parts.append(f"  Section '{section.label}' (no components listed)")
    sections_text = "\n".join(sections_text_parts) if sections_text_parts else "  (No sections defined)"

    # ── Components block ──────────────────────────────────────────────────────
    all_components = spec.all_components()
    comp_lines = []
    for comp in all_components:
        type_hint = f"({comp.type})" if comp.type else ""
        desc_hint = f" — {comp.description}" if comp.description else ""
        comp_lines.append(f"  • {comp.label} {type_hint}{desc_hint}")
    components_text = "\n".join(comp_lines) if comp_lines else "  (No components defined)"

    # ── Relationships block ───────────────────────────────────────────────────
    rel_lines = []
    comp_id_to_label = {c.id: c.label for c in all_components}
    for rel in spec.relationships:
        src_label = comp_id_to_label.get(rel.source, rel.source)
        tgt_label = comp_id_to_label.get(rel.target, rel.target)
        direction = "↔" if rel.direction == "bidirectional" else "→"
        edge_label = f" [{rel.label}]" if rel.label else ""
        rel_lines.append(f"  {src_label} {direction} {tgt_label}{edge_label}")
    relationships_text = "\n".join(rel_lines) if rel_lines else "  (No explicit relationships defined)"

    # ── Important labels ──────────────────────────────────────────────────────
    important_text = (
        ", ".join(spec.important_labels)
        if spec.important_labels
        else "(none specified)"
    )

    # ── Compose full prompt ───────────────────────────────────────────────────
    prompt = f"""Create a professional, presentation-quality technical architecture diagram image.

Subject:
{spec.title}

Purpose:
{spec.purpose}

Audience:
{spec.audience}

Canvas:
{orientation_rule}

Visual style:
- Modern enterprise architecture diagram style
- Dark navy blue background (#0a0f1e or similar deep dark)
- High-contrast rounded component cards with subtle glow borders
- Indigo and cyan accent colors for boundaries and connectors
- Clean, consistent sans-serif typography (all labels clearly readable)
- Professional, not cartoon-like. Suitable for a technical presentation deck.
- Consistent spacing and alignment throughout

Required sections and boundaries (draw as clearly labelled rounded rectangles):
{sections_text}

Required components (render each as a distinct labelled card inside its section):
{components_text}

Required connections (draw as clean directional arrows with labels):
{relationships_text}

Important components that must be visually prominent:
{important_text}

Layout rules:
- Place components belonging to the same section inside a clearly labelled boundary
- Maintain consistent horizontal and vertical spacing between components
- Arrows must not overlap component labels
- Arrows must not cross unnecessarily; route them cleanly
- Use straight or right-angle connector lines (orthogonal routing preferred)
- Components must not overlap each other
- All component labels must be fully visible and not clipped
- Maintain a clear visual hierarchy from left to right (or top to bottom if portrait)
- Use the full canvas efficiently — avoid large empty areas

Text rules:
- All component names must be spelled exactly as specified above
- Include a brief description, role explanation, or config details (e.g. lists of secrets, paths, ports, or functions like 'Used for async messaging', 'Secrets: database-url, api-key') as 1-2 lines of text or bullet points inside or directly below each component's card to explain the process and data flow.
- Do not place text labels directly on top of connector arrows
- Do not abbreviate component names in ways that change their meaning
- Every named component and its accompanying description must have its label visible in the final image

Do not include:
- Generic placeholder boxes labeled "Layer" or "Component" without specific names
- Decorative icons unrelated to the architecture
- Cartoon-style graphics, clip-art, or hand-drawn effects
- Random technical terms not listed in the component list above
- Components or systems not specified in the sections above
- Large solid color blocks without internal content
- Excessive decorative gradients that reduce text readability
- Watermarks or photographer attribution text

Alt text for accessibility: {spec.alt_text}
"""

    # Store the prompt on the spec for auditing (never returned to frontend)
    spec.image_prompt = prompt.strip()
    return prompt.strip()
