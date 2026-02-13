---
item: context-templates
project: context-builder
type: slice
github: null
dependencies: [foundation]
projectState: Feature Slice 1 (Basic Context Generation) complete - need to replace with sophisticated context template system
status: not-started
dateCreated: 20250912
dateUpdated: 20250127
---

# Slice Design: Context Templates System

## Problem Statement

The current context generation system produces basic markdown output that doesn't meet requirements for professional AI project context. The existing output format is:

```markdown
# Project: test2sdfsds
Template: react-vite
Slice: test
Instruction: implementation
Monorepo: No
```

This needs to be replaced with a sophisticated, multi-section context generation system that integrates with the project's AI system prompts.

## Requirements

### Functional Requirements
1. Generate structured context with configurable intro/glue statements
2. Integrate with `prompt.ai-project.system.md` for system prompts
3. Support conditional sections based on project configuration
4. Map instruction types to appropriate system prompts
5. Provide dynamic section assembly based on project data
6. Support user-configurable statements while maintaining defaults

### Target Context Format
```
{project-intro-statement}
{context-initialization-prompt}

### 3rd-Party Tools & MCP
{tool-intro-statement}
{tool-use-prompt}
{additional MCP availability info if applicable}

### Monorepo Note (if applicable)
{project-specific monorepo-and-package-information}

### Current Events
{current-events}

### Instruction Prompt
{instruction-intro-statement}
{instruction-prompt}

### Additional Notes
{additional-notes-if-applicable}
```

## Technical Decisions

### Statement Storage: Markdown vs TypeScript

**Decision**: Use Markdown files with frontmatter for statement storage
**Rationale**: 
- Consistent with project's markdown-heavy workflow
- User-editable without requiring rebuilds
- Supports rich formatting if needed
- Familiar frontmatter pattern already used in project

**Statement File Structure**:
```markdown
---
version: "1.0.0"
lastUpdated: "2025-01-27"
---

## Project Intro Statement
<!-- key: project-intro-statement, editable: true -->

We are continuing work on our project. Project information, environment context, instructions, and notes follow:

## Tool Intro Statement
<!-- key: tool-intro-statement, editable: true -->

The following tools and MCP servers are available for this project:
```

**Storage Location**: `project-documents/content/statements/default-statements.md`

### System Prompt Integration Strategy

**Decision**: Parse `prompt.ai-project.system.md` at runtime with caching
**Rationale**:
- File changes frequently and needs to use current version
- Runtime parsing allows for user customizations
- Caching provides performance without sacrificing flexibility

**Instruction Mapping**:
- `planning` → "Slice Planning (Phase 3)" prompt
- `implementation` → "Slice | Feature Implementation (Phase 7)" prompt  
- `debugging` → Custom debugging prompt or fallback
- `custom` → User-provided instruction text

## Data Flow Design

### Context Generation Flow
```
ProjectData → ContextIntegrator → ContextTemplateEngine → Structured Context String
                    ↓
           EnhancedContextData → SectionBuilder → Individual Sections
                    ↓                ↓
           StatementManager    SystemPromptParser
                    ↓                ↓
           Markdown Files      prompt.ai-project.system.md
```

### Core Services Architecture
```
ContextTemplateEngine (Orchestrator)
├── SystemPromptParser (Parses system prompt file)
├── StatementManager (Handles configurable statements)
├── SectionBuilder (Assembles individual sections)
└── PromptFileManager (File monitoring and validation)
```

## Component Interactions

### SystemPromptParser
- Parses `prompt.ai-project.system.md` using markdown parsing
- Extracts prompts by section headers (##### markers)
- Maps instruction types to specific prompt sections
- Provides fallback prompts when file unavailable
- Caches parsed prompts for performance

### StatementManager  
- Loads statements from markdown files with comment metadata
- Provides CRUD operations for user-configurable statements
- Handles fallback to defaults when custom statements missing
- Persists user modifications to separate files

### SectionBuilder
- Builds individual context sections based on project data
- Handles conditional section logic (monorepo, tools, MCP availability)
- Processes template variables within sections
- Detects available tools and MCP servers dynamically

### ContextTemplateEngine
- Orchestrates the entire context generation process
- Determines which sections to include based on project configuration
- Assembles sections in correct order
- Applies final formatting and cleanup

## Cross-Slice Dependencies

### Integration with Foundation Slice
- **ContextIntegrator**: Modified to use new template engine instead of DEFAULT_TEMPLATE
- **ProjectData/ContextData**: Extended with additional fields for template system
- **Real-time Preview**: Updated to work with section-based templates
- **Storage System**: Enhanced to persist statement configurations

### Data Structure Extensions
```typescript
interface EnhancedContextData extends ContextData {
  availableTools?: string[];
  mcpServers?: string[];
  templateVersion?: string;
  customSections?: Record<string, string>;
}
```

## UI Specifications

### No Immediate UI Changes Required
- Context output display works with new format (longer, structured content)
- Copy functionality requires no changes
- Real-time preview updates work with new template engine

### Future UI Considerations
- Statement editor component for advanced users
- Section reordering interface (drag-and-drop)
- Template preview/validation tools

## Performance Considerations

### Caching Strategy
- Parse system prompt file once, cache results
- Watch file for changes, invalidate cache on updates
- Cache statement configurations in memory
- Lazy load MCP/tool detection results

### Optimization Targets
- Context generation: < 200ms for typical projects
- Prompt file parsing: < 100ms on file changes
- Memory usage: Comparable to current system
- No impact on real-time preview responsiveness

## Error Handling and Fallbacks

### Graceful Degradation
1. **Missing Prompt File**: Use fallback prompts for essential sections
2. **Parsing Errors**: Fall back to current DEFAULT_TEMPLATE system
3. **Missing Statements**: Use hardcoded defaults
4. **MCP Detection Failure**: Skip tools section or show placeholder

### Error Recovery
- Log errors but continue context generation
- Provide clear error messages in development
- Maintain backward compatibility with existing projects

## Security Considerations

### File Access
- Restrict prompt file access to project directory
- Validate file paths to prevent directory traversal
- Sanitize user-provided statement content

### Content Validation
- Validate markdown parsing results
- Escape potentially harmful content in statements
- Limit file sizes for prompt and statement files

## Testing Strategy

### Unit Test Coverage
- SystemPromptParser: File parsing, section extraction, error handling
- StatementManager: CRUD operations, fallback behavior
- SectionBuilder: Conditional logic, template processing
- ContextTemplateEngine: Integration, section ordering, fallbacks

### Integration Testing
- End-to-end context generation with various project configurations
- File watching and cache invalidation
- Real-time preview integration
- Error scenarios and fallback behavior

### Test Data Requirements
- Sample prompt.ai-project.system.md files
- Various project configurations (monorepo, tools, instructions)
- Statement files with different configurations
- Error condition scenarios

## Conflicts and Considerations

### Potential Issues Identified
1. **Breaking Change**: New context format significantly different from current
   - **Mitigation**: Gradual rollout, maintain compatibility mode
2. **File Dependencies**: System depends on external prompt file
   - **Mitigation**: Robust fallback system, bundled default prompts
3. **Performance Impact**: More complex processing than current simple template
   - **Mitigation**: Caching, lazy loading, performance monitoring

### Future Extension Points
- Plugin system for custom section builders
- External prompt sources (GitHub, URLs)
- Multi-language support for statements
- Template marketplace for sharing configurations

## Success Criteria

### Technical Success Metrics
- All existing functionality preserved during transition
- New context format generates correctly for all project types
- Performance remains within acceptable bounds (< 200ms generation time)
- Error handling prevents crashes and provides meaningful feedback

### User Experience Success Metrics  
- Context output meets professional AI project standards
- Sections appear/disappear appropriately based on configuration
- System prompts stay current with project guide updates
- Users can customize statements without technical barriers

## Implementation Notes

### Effort Level: 4/5 (Medium-High Complexity)
This slice requires significant architectural changes while maintaining backward compatibility. The complexity comes from:
- Multi-service coordination
- File parsing and monitoring
- Conditional logic for section assembly
- Integration with existing real-time preview system

### Development Approach
Recommend incremental implementation:
1. Build core services in isolation
2. Integrate with existing system gradually
3. Add advanced features (MCP detection, file watching) last
4. Maintain fallback to existing system throughout development