# ResolveOps AI Documentation Prompt

Copy the prompt below into GPT when you want it to generate a formal project document from this repository.

```text
I am a DevOps fresher with approximately seven months of professional experience. Act as a patient technical writing mentor and experienced DevOps engineer. Help me create a clear, well-structured project documentation report for the project described below. The report should be suitable for a university project submission, internship or fresher portfolio, manager review, or client presentation. Write at a level that reflects my experience honestly: confident about the work, but without pretending that I am a senior architect.

PROJECT NAME
ResolveOps AI

PROJECT CONTEXT
ResolveOps AI is an evidence-first incident investigation and Root Cause Analysis (RCA) platform for cloud and containerized environments. It gives operations teams one interface for investigating incidents, services, deployments, infrastructure health, logs, metrics, costs, and reliability.

The platform collects live operational telemetry, optionally retrieves historical incident knowledge, and uses AI to produce structured and explainable results. The RCA investigation path is read-only. It must not automatically restart, scale, delete, roll back, or modify infrastructure.

CURRENT TECHNOLOGY AND ARCHITECTURE
- Next.js and React frontend for the operator interface and visual result rendering.
- Python-based backend services for APIs, integrations, orchestration, and domain logic.
- API gateway for authentication, routing, policy, and a stable frontend API.
- AI-RCA service for intent classification, MCP tool orchestration, AI invocation, and structured response generation.
- Model Context Protocol (MCP) server for controlled discovery and execution of operational evidence tools.
- AWS and Azure intelligence services for cloud evidence.
- GitHub intelligence service for repository and deployment evidence.
- Docker evidence adapter for read-only container and service evidence.
- PostgreSQL for users, incidents, and application records.
- Caddy for the external HTTP/HTTPS entry point.
- Docker Compose for deployment, service networking, volumes, dependencies, and health checks.
- Amazon Bedrock as the primary AI provider, with OpenAI-compatible provider support.
- Optional retrieval-augmented generation using historical incident and operational knowledge.

CORE INVESTIGATION WORKFLOW
1. The operator submits an incident ID, service name, question, and time window.
2. The API gateway authenticates and forwards the request to the AI-RCA service.
3. The orchestrator creates request and investigation IDs.
4. The AI provider receives the question, safety rules, and available MCP tools.
5. The model selects relevant read-only evidence tools.
6. The MCP server calls the appropriate integration services.
7. Tool results are converted into structured evidence items.
8. The model correlates the evidence and produces an RCA response.
9. The service returns the RCA, evidence, tool status, duration, and execution metadata.
10. The frontend renders the result and any warnings.

DOCUMENTATION REQUIREMENTS
Write the report using these sections:
1. Title page and executive summary
2. Background and problem statement
3. Project aim, objectives, and scope
4. Requirement analysis
   - Functional requirements
   - Non-functional requirements
   - Security and governance requirements
5. Existing manual process and its limitations
6. Proposed solution
7. System architecture and component responsibilities
8. End-to-end request and investigation workflow
9. Technology stack with justification for each technology
10. Methods and techniques used
    - Evidence-first investigation
    - MCP-based tool orchestration
    - Concurrent and fault-tolerant evidence collection
    - Retrieval-augmented context
    - Guardrailed AI reasoning
    - Structured output and graceful degradation
11. Detailed working of the proposed system
12. Data flow and evidence lifecycle
13. Security, privacy, access control, and governance
14. Deployment and operational requirements
15. Testing and validation approach
16. Expected benefits and measurable outcomes
17. Limitations, assumptions, risks, and future enhancements
18. Conclusion
19. References to the repository documentation
20. Appendix for screenshots and diagrams

WRITING RULES
- Use simple, clear, professional language suitable for a DevOps fresher.
- Explain technical terms the first time they appear; include the abbreviation afterward where useful.
- Use first person only when describing my contribution, and use neutral project language for system behavior.
- Present the work as a practical project I implemented or studied, not as a claim of many years of enterprise experience.
- Avoid exaggerated words such as revolutionary, world-class, fully autonomous, zero-risk, or guaranteed.
- Do not make the writing unnecessarily complex just to sound academic. Prefer short paragraphs, examples, tables, and numbered steps.
- Explain why each design decision was made, not only what each component does.
- Clearly distinguish implemented functionality from proposed or future functionality.
- Do not invent performance numbers, test results, users, incidents, cloud resources, screenshots, or capabilities.
- Do not claim that a feature exists unless it is supported by the project context or repository files.
- Use tables for requirements, components, technology stack, risks, and test cases where useful.
- Include Mermaid diagrams only when they improve understanding, and ensure diagrams match the architecture.
- Explain evidence quality, confidence, unavailable sources, and insufficient-evidence behavior.
- Emphasize that the RCA workflow is read-only and that remediation requires separate authorization and approval controls.
- When screenshots are not available, use placeholders such as [Insert screenshot: RCA result].
- When screenshots are supplied later, add figure numbers, captions, and a short interpretation for each image.
- End with a concise summary of how ResolveOps AI reduces investigation effort while preserving evidence quality and operational safety.

SOURCE MATERIAL
Use the repository README and the numbered documents in the docs directory as supporting context. If the source material is incomplete, mark the item as an assumption instead of guessing.
```