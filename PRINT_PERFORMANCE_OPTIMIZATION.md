# Multi-Format Download & Sharing Performance Optimization Project

## Problem Statement

The current multi-board processing functionality in LingoLinq-AAC has significant performance and usability issues affecting multiple features:

### Current Issues
1. **Extreme Processing Times**: Robust board sets take 30-45 minutes to generate PDFs
2. **Poor User Experience**: No progress indication beyond time estimates
3. **Fragile Process**: Navigation away from the page cancels the print job
4. **Blocking UI**: Users cannot continue using speech boards while printing
5. **No Recovery**: Failed or interrupted prints cannot be resumed

### Current Architecture
The print process follows this flow:
```
User Action → Frontend Modal → Backend API → Progress Scheduling → 
PDF Generation (Sequential) → S3 Upload → Download Link
```

**Key Components:**
- Frontend: `app/frontend/app/controllers/application.js` (printBoard action)
- Modal: `app/frontend/app/templates/download-board.hbs` 
- Backend: `app/models/board.rb` (generate_download method)
- Conversion: `lib/converters/utils.rb` → `lib/converters/cough_drop.rb`
- Progress: Polling-based system with `Progress` model

## Root Cause Analysis

### Performance Bottlenecks
1. **Sequential Processing**: Each board in a set is processed individually
2. **Heavy PDF Generation**: Server-side conversion using Ruby/external libraries
3. **Single-threaded Execution**: No parallel processing for multiple boards
4. **Resource-intensive Operations**: Complex board layouts with images and symbols

### Stability Issues  
1. **Client-side Progress Dependency**: Progress tracking requires continuous polling
2. **No Job Persistence**: Completed jobs aren't stored for later retrieval
3. **Memory Intensive**: Large board sets may cause memory pressure
4. **No Error Recovery**: Failed operations must restart from beginning

## Related Features with Shared Issues

Research reveals that multiple features share the same underlying performance and stability problems:

### 1. OBF Download Feature (CONFIRMED - Same Issues)
**Location**: `lib/converters/cough_drop.rb` → `to_obf` and `to_obz` methods  
**Problem**: OBZ downloads (multiple boards) use identical architecture to PDF generation:
- Sequential processing of each board in the set
- Same Progress tracking system with polling dependency
- Same time estimates based on board count (`approx_cells` calculation)
- Same frontend modal and backend job scheduling
- Same 30-45 minute processing times for large board sets

**Key Finding**: OBF multi-board downloads should be included in this optimization project as they share 100% of the same bottlenecks.

### 2. Board Sharing Feature (RELATED - Different Issues)
**Location**: `app/models/concerns/sharing.rb` and `BoardCaching` concern  
**Problem**: Deep sharing has performance safeguards indicating bottlenecks:
- Processing large hierarchies of downstream boards
- Explicit 10,000 board limit to prevent performance overloads  
- Cache invalidation across multiple users when sharing changes
- Background jobs for `update_available_boards` when >500 boards

**Key Finding**: While related, board sharing has different performance characteristics (one-time setup vs. ongoing processing), but may benefit from similar caching strategies.

### Current Worker System Analysis
**Technology**: Resque with `:default` and `:slow` queues  
**Key Findings**:
- Long-running tasks already segregated to `:slow` queue
- Progress tracking system exists but uses client-side polling
- Background job persistence available but not utilized for downloads
- `Worker.process_queues` method available for job management

## Proposed Solutions

### Phase 1: Stability & User Experience (Priority: High)

#### 1.1 Background Job Persistence
- **Objective**: Allow users to navigate away and return to completed jobs
- **Implementation**: 
  - Store completed files (PDF/OBF/OBZ) with expiration (e.g., 24 hours)
  - Add job history/status page accessible from user menu
  - Email notifications when large jobs complete

#### 1.2 Enhanced Progress Tracking
- **Objective**: Provide detailed, real-time progress updates
- **Implementation**:
  - Replace polling with WebSocket connections
  - Show granular progress: "Processing board 15 of 47"
  - Display current board name being processed
  - Add progress bar with actual percentages

#### 1.3 Non-blocking UI
- **Objective**: Users can continue using speech boards during file generation
- **Implementation**:
  - Move download jobs (PDF/OBF/OBZ) to background service
  - Add notification system for job completion
  - Allow multiple concurrent download jobs per user

### Phase 2: Performance Optimization (Priority: Medium)

#### 2.1 Parallel Processing
- **Objective**: Reduce overall processing time by 60-70%
- **Implementation**:
  - Break board sets into chunks for parallel processing
  - Use worker pools for concurrent file generation (PDF/OBF/OBZ)
  - Implement queue prioritization for smaller jobs

#### 2.2 Intelligent Caching
- **Objective**: Eliminate redundant processing
- **Implementation**:
  - Cache rendered board layouts by configuration hash
  - Pre-generate common board templates
  - Implement incremental updates for modified boards

#### 2.3 Optimized Conversion Pipeline
- **Objective**: Reduce per-board processing time
- **Implementation**:
  - Evaluate faster PDF generation libraries
  - Optimize OBF/OBZ serialization and compression
  - Implement direct HTML-to-PDF conversion
  - Optimize image processing and compression

### Phase 3: Advanced Features (Priority: Low)

#### 3.1 Smart Batching
- Group similar board requests
- Implement request coalescing for identical print jobs

#### 3.2 Progressive Downloads
- Stream completed pages as they're generated
- Allow partial downloads for large sets

#### 3.3 Print Presets
- Save common print configurations
- One-click printing for frequent use cases

## Implementation Roadmap

### Week 1-2: Research & Planning
- [x] Analyze current Worker/job queue system (Resque with `:slow` queue)
- [x] Identify related features with shared issues (OBF downloads confirmed)
- [ ] Profile PDF and OBF generation bottlenecks in `Converters::CoughDrop`
- [ ] Research WebSocket integration options (ActionCable available)
- [ ] Design job persistence schema

### Week 3-4: Phase 1 Implementation  
- [ ] Implement background job persistence
- [ ] Add WebSocket progress updates
- [ ] Create job status/history UI
- [ ] Add email notifications

### Week 5-6: Phase 1 Testing
- [ ] Test with various board set sizes
- [ ] Validate progress tracking accuracy  
- [ ] User acceptance testing
- [ ] Performance baseline measurement

### Week 7-8: Phase 2 Planning
- [ ] Design parallel processing architecture
- [ ] Plan caching strategy
- [ ] Evaluate PDF generation alternatives

## Technical Considerations

### Dependencies
- **WebSocket Library**: ActionCable (already available in Rails)
- **Background Jobs**: Current Worker system or consider Sidekiq
- **Caching**: Redis for job state and PDF caching
- **File Storage**: Current S3 setup with expiration policies

### Risks & Mitigation
1. **Memory Usage**: Implement streaming and cleanup processes
2. **Concurrent Jobs**: Add rate limiting and resource monitoring  
3. **Storage Costs**: Implement automatic cleanup of old print jobs
4. **User Expectations**: Clear communication about processing times

### Success Metrics
- **Processing Time**: Reduce 30-45 minute jobs to under 10 minutes
- **Success Rate**: Achieve >95% completion rate for all multi-board download jobs
- **User Satisfaction**: Enable navigation during file generation (PDF/OBF/OBZ)
- **Resource Usage**: Monitor memory and CPU impact
- **Feature Parity**: Ensure all optimizations work for both PDF and OBF downloads

## Next Steps

1. **Team Review**: Review and approve this document
2. **Technical Spike**: 2-day investigation of current bottlenecks
3. **Architecture Design**: Detailed technical design for Phase 1
4. **Development**: Begin implementation with Phase 1 features

---

**Author**: Claude Code Assistant  
**Date**: August 27, 2025  
**Branch**: `feature/print-performance-optimization`