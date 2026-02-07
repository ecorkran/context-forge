---
item: context-templates
project: context-builder
type: slice-tasks
lldReference: private/slices/101-slice.context-templates.md
dependencies: [foundation]
projectState: complete
dateUpdated: 2026-02-07
---

# Task Breakdown: Context Templates System

## Context Summary

This slice replaces the current basic markdown template system with a sophisticated, multi-section context generation system. The current system produces simple output like "# Project: test2sdfsds" but we need structured context with configurable intro statements, system prompt integration, and dynamic sections based on project configuration.

The new system will generate context in this format:
- Project intro statement
- Context initialization prompt (from system file)  
- Conditional sections (Tools/MCP, Monorepo, Current Events)
- Instruction-specific prompts
- Additional notes

Key technical components: SystemPromptParser, StatementManager, SectionBuilder, ContextTemplateEngine, and integration with existing ContextIntegrator.

## Task List

### Task 1: Statement Storage System
**Effort: 2/5**

- [x] **Task 1.1: Create Default Statements File**
  - Create `project-documents/content/statements/default-statements.md`
  - Add YAML frontmatter with version and lastUpdated
  - Include all required statements with HTML comment metadata:
    - project-intro-statement
    - tool-intro-statement  
    - instruction-intro-statement
  - Use markdown format with `<!-- key: statement-key, editable: true -->` comments
  - **Success:** Default statements file exists with proper format and all required statements

- [x] **Task 1.2: Create Statement Data Types**
  - Create `src/services/context/types/TemplateStatement.ts`
  - Define TemplateStatement interface with key, content, description, editable fields
  - Define StatementConfig interface for storage
  - Export all types for use in other services
  - **Success:** TypeScript types defined and compilable

- [x] **Task 1.3: Create StatementManager Service**
  - [x] **1.3.1: Create StatementManager class structure**
    - Create `src/services/context/StatementManager.ts`
    - Create class with private statements cache property
    - Add constructor with optional file path parameter
    - Import required types from TemplateStatement.ts
    - **Success:** Basic class structure exists and compiles
    
  - [x] **1.3.2: Implement markdown parsing logic**
    - Add parseMarkdownStatements() private method
    - Parse YAML frontmatter using existing project patterns
    - Extract statements from HTML comments using regex pattern:
      ```typescript
      /<!--\s*key:\s*([^,]+),\s*editable:\s*(true|false)\s*-->/g
      ```
    - Map comment keys to statement content from following markdown sections
    - Handle malformed comments gracefully with warnings
    - **Success:** Parser extracts statements from properly formatted markdown files
    
  - [x] **1.3.3: Implement CRUD operations**
    - Add getStatement(key: string): string method with fallback to defaults
    - Add updateStatement(key: string, content: string): void method
    - Add getAllStatements(): Record<string, TemplateStatement> method
    - Include validation for statement keys and content
    - **Success:** All CRUD methods work with cached statement data
    
  - [x] **1.3.4: Add persistence layer**
    - Add loadStatements() method to read from markdown file
    - Add saveStatements() method to write updates back to file
    - Handle file system errors with meaningful error messages
    - Implement atomic file writes to prevent corruption
    - **Success:** Statements persist correctly between application restarts
    
  - [x] **1.3.5: Add fallback system**
    - Create hardcoded DEFAULT_STATEMENTS object with all required statements
    - Implement fallback logic when files are missing or corrupt
    - Log warnings when falling back to defaults
    - Ensure system continues working even without statement files
    - **Success:** StatementManager works reliably even with missing files

- [x] **Task 1.4: Create StatementManager Unit Tests**
  - Create `src/services/context/StatementManager.test.ts`
  - Test markdown file parsing with various comment formats
  - Test CRUD operations and fallback behavior
  - Test error handling for malformed files
  - Test persistence operations
  - **Success:** All StatementManager functionality tested with >90% coverage

### Task 2: System Prompt Integration
**Effort: 3/5**

- [x] **Task 2.1: Create System Prompt Data Types**
  - Create `src/services/context/types/SystemPrompt.ts`
  - Define SystemPrompt interface with name, key, content, parameters
  - Define instruction mapping types
  - Export types for parser service
  - **Success:** SystemPrompt types defined and compilable

- [x] **Task 2.2: Create SystemPromptParser Service**
  - [x] **2.2.1: Create SystemPromptParser class structure**
    - Create `src/services/context/SystemPromptParser.ts`
    - Create class with private prompts cache and filePath properties
    - Import SystemPrompt types and add constructor
    - Set up basic error handling and logging infrastructure
    - **Success:** Basic class structure exists and compiles
    
  - [x] **2.2.2: Implement markdown section parsing**
    - Add parsePromptFile() method to read and process markdown file
    - Use regex to extract sections by ##### headers:
      ```typescript
      /^##### (.+)$/gm
      ```
    - Extract content between headers, handling nested sections properly
    - Parse code blocks within sections using ```markdown delimiters
    - Store prompts with keys derived from section titles
    - **Success:** Parser extracts all sections from system prompt file
    
  - [x] **2.2.3: Implement specific prompt extraction methods**
    - Add getContextInitializationPrompt() method
      - Look for "Model Change or Context Refresh" section
      - Extract markdown code block content
      - Return SystemPrompt object with processed content
    - Add getToolUsePrompt() method  
      - Look for "Use 3rd Party Tool" section
      - Extract and return tool usage instructions
    - Handle missing sections with meaningful error messages
    - **Success:** Specific prompt extraction methods work reliably
    
  - [x] **2.2.4: Add instruction mapping logic**
    - Create INSTRUCTION_MAPPING constant with known mappings:
      ```typescript
      {
        'planning': 'Slice Planning (Phase 3)',
        'implementation': 'Slice | Feature Implementation (Phase 7)',
        'debugging': 'Analysis Task Implementation'  // fallback
      }
      ```
    - Implement getPromptForInstruction() method using mapping
    - Add fuzzy matching for instruction types (case insensitive, partial matches)
    - Return null for unknown instructions to allow custom handling
    - **Success:** All instruction types map correctly to system prompts
    
  - [x] **2.2.5: Add caching and file monitoring**
    - Implement prompt caching to avoid repeated file parsing
    - Add cache invalidation when file modification time changes
    - Include memory management to prevent cache bloat
    - Add optional file watching for development environments
    - **Success:** Parser performs efficiently with proper caching

- [x] **Task 2.3: Implement Instruction Type Mapping**
  - Add instruction mapping logic in SystemPromptParser
  - Map 'planning' to "Slice Planning (Phase 3)" prompt
  - Map 'implementation' to "Slice | Feature Implementation (Phase 7)" prompt
  - Map 'debugging' to appropriate prompt or fallback
  - Handle 'custom' instruction type with user text
  - **Success:** All instruction types map to correct prompts or fallbacks

- [x] **Task 2.4: Create SystemPromptParser Unit Tests**
  - Create `src/services/context/SystemPromptParser.test.ts`
  - Test markdown parsing with sample system prompt files
  - Test instruction mapping for all supported types
  - Test error handling for missing files and malformed content
  - Test caching behavior and cache invalidation
  - **Success:** Parser functionality fully tested with >90% coverage

- [x] **Task 2.5: Create PromptFileManager Service**
  - Create `src/services/context/PromptFileManager.ts`
  - Implement loadPromptFile() with file system access
  - Add validatePromptFile() for structure validation
  - Include basic file watching setup (without live updates initially)
  - Add error handling for missing files
  - **Success:** File manager loads and validates system prompt files

### Task 3: Section Building System
**Effort: 3/5**

- [x] **Task 3.1: Create Section Data Types**
  - Create `src/services/context/types/ContextSection.ts`
  - Define ContextSection interface with key, title, content, conditional, order
  - Define ContextTemplate interface for complete template structure
  - Include conditional function types for dynamic sections
  - **Success:** Section types support all required section configurations

- [x] **Task 3.2: Create SectionBuilder Service**
  - Create `src/services/context/SectionBuilder.ts`
  - Implement buildToolsSection() for tools and MCP content
  - Implement buildMonorepoSection() for monorepo-specific information
  - Implement buildInstructionSection() with prompt mapping
  - Add conditional logic helpers for section inclusion
  - **Success:** SectionBuilder creates all required section types

- [x] **Task 3.3: Implement MCP and Tools Detection**
  - Add detectMCPAvailability() method to SectionBuilder
  - Add detectAvailableTools() method for tool detection
  - Create placeholder implementations that return sensible defaults
  - Document interfaces for future integration with actual detection
  - **Success:** Detection methods return appropriate placeholder content

- [x] **Task 3.4: Create SectionBuilder Unit Tests**
  - Create `src/services/context/SectionBuilder.test.ts`
  - Test each section building method with various inputs
  - Test conditional section logic
  - Test template variable processing within sections
  - Test error handling and fallback behavior
  - **Success:** All SectionBuilder methods tested with >90% coverage

### Task 4: Template Engine Core
**Effort: 4/5**

- [x] **Task 4.1: Create ContextTemplateEngine Service**
  - [x] **4.1.1: Create ContextTemplateEngine class structure**
    - Create `src/services/context/ContextTemplateEngine.ts`
    - Create class with private service dependencies (promptParser, statementManager, sectionBuilder)
    - Add constructor with dependency injection pattern
    - Import all required types and establish service contracts
    - **Success:** Template engine class structure exists with proper dependencies
    
  - [x] **4.1.2: Implement generateContext() main method**
    - Add generateContext(data: EnhancedContextData): string method
    - Call buildTemplate() to create template configuration
    - Call assembleSections() to process template into sections
    - Call formatOutput() for final context string
    - Add comprehensive error handling with fallback to DEFAULT_TEMPLATE
    - **Success:** Main context generation method orchestrates all steps
    
  - [x] **4.1.3: Implement buildTemplate() configuration method**
    - Create template configuration based on input data
    - Define all required sections with their properties:
      ```typescript
      sections: [
        { key: 'project-intro', order: 1, conditional: false },
        { key: 'context-init', order: 2, conditional: false },
        { key: 'tools-section', order: 3, conditional: true, condition: hasToolsOrMCP },
        { key: 'monorepo-section', order: 4, conditional: true, condition: data.isMonorepo },
        // ... etc
      ]
      ```
    - Include conditional logic helpers for dynamic section inclusion
    - Return complete ContextTemplate object
    - **Success:** Template configuration correctly defines all sections
    
  - [x] **4.1.4: Add utility methods**
    - Add formatOutput() method for final cleanup (remove extra whitespace, normalize line endings)
    - Add validateInputData() method to check required fields
    - Add getErrorContext() fallback method for error scenarios
    - Include logging and debugging utilities
    - **Success:** Template engine has all required utility methods

- [x] **Task 4.2: Implement Section Assembly Logic**
  - [x] **4.2.1: Create assembleSections() core method**
    - Add assembleSections(template: ContextTemplate, data: EnhancedContextData): string method
    - Filter sections based on conditional logic evaluation
    - Sort sections by order field for proper sequence
    - Process each section through content generation pipeline
    - Combine all sections into final context string
    - **Success:** Section assembly produces properly ordered context
    
  - [x] **4.2.2: Implement section filtering logic**
    - Add evaluateCondition() helper method for conditional sections
    - Implement hasToolsOrMCP() condition checker
    - Add section inclusion logic based on data properties
    - Handle edge cases where conditions are undefined
    - **Success:** Conditional sections appear/disappear correctly based on data
    
  - [x] **4.2.3: Add section content processing**
    - Implement processSection() method for individual section handling
    - Add template variable substitution within section content
    - Include section title formatting (### Title format for markdown)
    - Handle empty sections gracefully (skip or show placeholder)
    - **Success:** Individual sections are properly formatted with content
    
  - [x] **4.2.4: Add section combining logic**
    - Combine processed sections with proper spacing
    - Add section separators (double newlines between sections)
    - Handle edge cases like all sections being conditional and hidden
    - Ensure final output has proper markdown structure
    - **Success:** Final context has proper section formatting and spacing

- [x] **Task 4.3: Add Error Handling and Fallbacks**
  - Implement getErrorContext() fallback to current DEFAULT_TEMPLATE
  - Add handleMissingPromptFile() with fallback prompts
  - Include error logging without breaking context generation
  - Add validation for required services and data
  - **Success:** Engine handles all error conditions gracefully

- [x] **Task 4.4: Create Enhanced Context Data Types**
  - Create EnhancedContextData interface extending ContextData
  - Add fields for availableTools, mcpServers, templateVersion
  - Include customSections field for future extensibility
  - Update related types and interfaces
  - **Success:** Enhanced data types support all template engine features

- [x] **Task 4.5: Create ContextTemplateEngine Unit Tests**
  - Create `src/services/context/ContextTemplateEngine.test.ts`
  - Test complete context generation with various project configurations
  - Test section assembly and ordering logic
  - Test error handling and fallback scenarios
  - Test integration with all component services
  - **Success:** Template engine fully tested with >90% coverage

### Task 5: Integration with Existing System
**Effort: 3/5**

- [x] **Task 5.1: Update Context Data Types**
  - Modify `src/services/context/types/ContextData.ts`
  - Add optional fields for enhanced functionality
  - Ensure backward compatibility with existing code
  - Update exports and related type definitions
  - **Success:** ContextData types support both old and new systems

- [x] **Task 5.2: Update ContextIntegrator Service**
  - [x] **5.2.1: Add new template engine integration**
    - Modify `src/services/context/ContextIntegrator.ts` to import ContextTemplateEngine
    - Add private templateEngine property to class
    - Create feature flag ENABLE_NEW_TEMPLATE_ENGINE in constructor
    - Maintain existing templateProcessor for fallback compatibility
    - **Success:** ContextIntegrator can switch between old and new systems
    
  - [x] **5.2.2: Update generateContextFromProject() method**
    - Modify main context generation method to use feature flag
    - Add conditional logic:
      ```typescript
      if (this.enableNewEngine) {
        return this.generateWithTemplateEngine(project);
      } else {
        return this.generateWithLegacySystem(project);
      }
      ```
    - Implement generateWithTemplateEngine() using new system
    - Maintain existing logic in generateWithLegacySystem()
    - Add error handling to fallback between systems
    - **Success:** Context generation works with both old and new systems
    
  - [x] **5.2.3: Enhance project data mapping**
    - Update mapProjectToContext() to return EnhancedContextData
    - Add detectAvailableTools() method for tool detection
    - Add detectMCPServers() method for MCP detection
    - Include templateVersion field for tracking
    - Maintain backward compatibility with existing ContextData usage
    - **Success:** Enhanced data mapping supports new template features
    
  - [x] **5.2.4: Add tool and MCP detection logic**
    - Implement detectAvailableTools() with placeholder logic
    - Implement detectMCPServers() with placeholder logic
    - Document interfaces for future integration with actual detection
    - Return sensible defaults for development
    - **Success:** Detection methods provide appropriate placeholder data

- [x] **Task 5.3: Update Project Data Mapping**
  - Enhance mapProjectToContext() in ContextIntegrator
  - Add availableTools detection and mapping
  - Add mcpServers detection and mapping
  - Include templateVersion for tracking
  - **Success:** Project data maps correctly to enhanced context data

- [x] **Task 5.4: Add Integration Configuration**
  - Create configuration flag to enable/disable new template system
  - Add feature flag support for gradual rollout
  - Include performance monitoring hooks
  - Add debugging/logging configuration
  - **Success:** System can switch between old and new template engines

- [x] **Task 5.5: Update Integration Tests**
  - Modify existing integration tests to work with both systems
  - Add tests for enhanced context data mapping
  - Test real-time preview integration with new templates
  - Test copy functionality with new context format
  - **Success:** All existing functionality works with new template system

### Task 6: Electron IPC Architecture Migration ✅ COMPLETED
**Effort: 4/5**

- [x] **Task 6.1: Move File Services to Main Process**
  - [x] **6.1.1: Create main process service directory**
    - Create `src/main/services/context/` directory structure
    - Move StatementManager.ts to main process location
    - Move SystemPromptParser.ts to main process location  
    - Move PromptFileManager.ts to main process location
    - Keep all existing logic intact (filesystem access works in main process)
    - **Success:** File services operate in main process with full filesystem access
    
  - [x] **6.1.2: Update main process service imports**
    - Update imports to remove renderer-specific dependencies
    - Ensure services can operate independently in main process
    - Add proper error handling for main process context
    - Test services work in isolation in main process
    - **Success:** Services compile and run correctly in main process

- [x] **Task 6.2: Create IPC Interface**
  - [x] **6.2.1: Extend electronAPI interface**
    - Add statements IPC methods to `electronAPI` in preload script:
      ```typescript
      statements: {
        load: (filename?: string) => Promise<Record<string, TemplateStatement>>;
        save: (filename: string, statements: Record<string, TemplateStatement>) => Promise<void>;
        getStatement: (filename: string, key: string) => Promise<string>;
        updateStatement: (filename: string, key: string, content: string) => Promise<void>;
      }
      ```
    - Add systemPrompts IPC methods:
      ```typescript
      systemPrompts: {
        parse: (filename?: string) => Promise<SystemPrompt[]>;
        getContextInit: (filename?: string) => Promise<SystemPrompt | null>;
        getToolUse: (filename?: string) => Promise<SystemPrompt | null>;
        getForInstruction: (filename: string, instruction: string) => Promise<SystemPrompt | null>;
      }
      ```
    - **Success:** IPC interface provides all required file service methods
    
  - [x] **6.2.2: Implement IPC handlers in main process**
    - Create `src/main/ipc/contextServices.ts` with IPC handlers
    - Implement statement management handlers using moved StatementManager
    - Implement system prompt handlers using moved SystemPromptParser
    - Add proper error handling and response formatting
    - Register all handlers with `ipcMain.handle()`
    - **Success:** Main process responds correctly to all IPC calls

- [x] **Task 6.3: Create Renderer IPC Adapters**
  - [x] **6.3.1: Create StatementManager IPC adapter**
    - Create `src/services/context/StatementManagerIPC.ts`
    - Implement same interface as original StatementManager
    - Delegate all operations to IPC calls via `window.electronAPI.statements`
    - Maintain async/await patterns and error handling
    - Include caching for performance (cache results from IPC calls)
    - **Success:** StatementManagerIPC provides identical interface to original
    
  - [x] **6.3.2: Create SystemPromptParser IPC adapter**
    - Create `src/services/context/SystemPromptParserIPC.ts`
    - Implement same interface as original SystemPromptParser
    - Delegate parsing operations to main process via IPC
    - Maintain caching and instruction mapping logic in renderer
    - Handle file path resolution through main process
    - **Success:** SystemPromptParserIPC provides identical interface to original
    
  - [x] **6.3.3: Update service exports**
    - Update `src/services/context/index.ts` to export IPC adapters
    - Create factory functions to choose between direct and IPC implementations
    - Add environment detection (Electron vs browser) for adapter selection
    - Maintain backward compatibility with existing imports
    - **Success:** Services can be imported and used without code changes

- [x] **Task 6.4: Update Template Engine Integration**
  - [x] **6.4.1: Update ContextTemplateEngine dependencies**
    - Modify ContextTemplateEngine constructor to use IPC adapters
    - Update dependency injection to pass IPC versions of services
    - Test that template engine works with IPC-based file services
    - Verify async operations work correctly across IPC boundary
    - **Success:** ContextTemplateEngine works seamlessly with IPC services
    
  - [x] **6.4.2: Update ContextIntegrator integration**
    - Modify ContextIntegrator to instantiate IPC versions of services
    - Test that context generation works end-to-end with IPC
    - Verify performance is acceptable with IPC overhead
    - Add error handling for IPC communication failures
    - **Success:** Full context generation pipeline works via IPC

- [x] **Task 6.5: Create IPC Integration Tests**
  - Create test suite for IPC communication between renderer and main
  - Test all statement management operations via IPC
  - Test system prompt parsing operations via IPC  
  - Test error scenarios (main process errors, communication failures)
  - Verify data integrity across IPC boundary
  - **Success:** IPC layer fully tested and reliable

### Task 9: Documentation and Integration
**Effort: 1/5**

- [x] **Task 9.1: Create Service Documentation**
  - Document all public APIs for new services
  - Create usage examples for StatementManager
  - Document SystemPromptParser integration points
  - Include troubleshooting guide for common issues
  - **Success:** Complete API documentation exists for all services

- [x] **Task 9.2: Update Existing Documentation**
  - Update any references to old template system
  - Document new context format and sections
  - Include migration guide for existing projects
  - Update development setup instructions
  - **Success:** All documentation reflects new template system

### Task 10: Core Template Validation & Testing
**Effort: 3/5**

- [x] **Task 10.1: Start/Continue Statement Logic**
  - Add start/continue toggle to form
  - Create statement selection logic based on start vs continue
  - Update statements file with both options
  - Test statement switching in UI
  - **Success:** Users can choose appropriate opening statement

- [x] **Task 10.2: Form Field Organization**
  - Reorganize form fields to match output order:
    1. Project name and slice
    2. Start/continue selection
    3. Context initialization settings
    4. 3rd party tools/MCP toggle
    5. Repository structure toggle (optional)
    6. Recent events
    7. Current work/task file
    8. Instructions (development phase)
    9. Additional notes
  - Add optional field toggles with "disable but keep" behavior
  - **Success:** Form mirrors expected output structure

- [x] **Task 10.3: Real Prompt File Integration**
  - Test with actual prompt.ai-project.system.md file
  - Verify context initialization prompt integration
  - Test 3rd party tools prompt mapping
  - Test instruction prompt mapping for development phases
  - Validate template variable substitution (project name, etc.)
  - **Success:** All prompts correctly referenced and substituted

- [ ] **Task 10.4: Template Output Validation** (DEFERRED)
  - Status: DEFERRED - Test infrastructure issue with IPC mocking in unit tests
  - Will validate when: IPC test mocks are implemented or app deployed
  - Generate complete context with all sections
  - Verify output matches expected structure:
    ```
    {start/continue-statement}
    { project: projectname, slice: slicename }

    {context-initialization-prompt}

    ### 3rd-Party Tools & MCP
    {tools-prompt}

    ### Repository Structure (if enabled)
    {repository-info}

    ### Recent Events
    {recent-events}

    ### Current Work
    {task-file-info}

    ### Instructions
    {instruction-prompt}

    ### Additional Notes
    {additional-notes}
    ```
  - Test with various combinations of optional sections
  - **Success:** Output structure matches specification exactly

## Task Dependencies

### Sequential Dependencies
- Task 1 (Statement Storage) must complete before Task 4 (Template Engine)
- Task 2 (System Prompt Integration) must complete before Task 4 (Template Engine)  
- Task 3 (Section Building) must complete before Task 4 (Template Engine)
- Task 4 (Template Engine) must complete before Task 5 (Integration)
- Task 5 (Integration) must complete before Task 6 (IPC Architecture)
- Task 6 (IPC Architecture) must complete before Task 8 (Testing)

### Parallel Work Opportunities
- Tasks 1, 2, and 3 can be developed in parallel
- Task 7 (Performance) can be developed alongside Task 6 (IPC Architecture)
- Task 9 (Documentation) can be developed alongside testing phases

## Risk Mitigation

### Technical Risks
- **File parsing complexity**: Start with simple parsing, iterate based on actual prompt file structure
- **Performance impact**: Implement caching early, monitor throughout development
- **Integration complexity**: Maintain feature flag to allow rollback during development

### Quality Assurance
- Each task includes comprehensive unit tests
- Integration tests validate cross-service interactions  
- End-to-end tests ensure user-facing functionality works
- Performance tests validate against specified targets

## Success Criteria Summary

Upon completion of all tasks:
- [ ] Context generation produces structured, professional output
- [ ] System integrates with prompt.ai-project.system.md file
- [ ] Users can configure intro/glue statements via markdown files
- [ ] Conditional sections appear based on project configuration
- [ ] Performance meets targets (<200ms generation, responsive preview)
- [ ] All existing functionality preserved and enhanced
- [ ] Comprehensive test coverage ensures reliability
- [ ] Clear documentation supports future maintenance and extension