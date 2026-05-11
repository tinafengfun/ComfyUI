# Intel XPU migration retrospective

## 1. Executive summary

The migration work evolved from a **single-workflow porting task** into a broader **method-building effort**.  
At the beginning, the work was focused on making one Dasiwa workflow run on Intel XPU. By the end, the repo contained:

1. reusable migration prompts and skills
2. reusable release, review, deployment, and node-package standards
3. workflow-specific evidence for Dasiwa
4. package-specific evidence for Mixlab and WanVideoWrapper
5. a clearer split between:
   - native XPU migration
   - CPU fallback
   - environment/integration gap
   - feature-development gap
   - capacity hard stop

This is the biggest process-level success of the effort: the work no longer depends on one engineer remembering what failed before.

## 2. Migration phases

### Phase 0: workflow feasibility and inventory

The work started with analysis of the target workflow:

1. workflow topology
2. output branches
3. model references
4. custom-node dependencies
5. XPU risk points

This phase produced the first key realization: the target workflow was not one linear path. It was a **multi-branch workflow** with different generation modes, helper nodes, and postprocess nodes. That forced the migration method to become branch-aware instead of relying on one “full run succeeded” claim.

### Phase 1: asset resolution and custom-node triage

The next phase focused on making the workflow executable at all:

1. locating model files and LoRAs
2. identifying missing or unresolved proprietary assets
3. staging public assets
4. identifying custom-node repositories
5. auditing CUDA-shaped helper nodes

This phase exposed one of the most persistent realities of the migration:

- some assets could be resolved and staged
- some could only be covered with **smoke-only compatibility aliases**
- some remained unresolved as source-identical proprietary files

That distinction later became a reusable documentation rule.

### Phase 2: prompt conversion and runtime correctness

After asset staging, the main problem shifted from “missing things” to “the workflow exports incorrectly or validates incorrectly”.

The important corrections here were:

1. widget-only/literal node export
2. selector-backed basename normalization
3. prompt validation response capture
4. checking `node_errors` before trusting `execution_success`
5. verifying that intended output nodes were actually executed

This phase was critical because it invalidated a common failure mode:

> a run that looks successful in logs may still have skipped the real branch you wanted.

This lesson later became part of the reusable migration prompt, review prompt, and release standard.

### Phase 3: branch smoke and workflow-preserving migration

Once export and validation were trustworthy, the work moved to branch-isolated smoke runs.  
This was where the migration became repeatable and measurable.

Key outcomes:

1. all three preserved Dasiwa output branches gained prompt-validation coverage
2. reduced-resource branch smoke succeeded on Intel XPU
3. workflow-preserving helpers and wrappers became part of the toolchain

This phase proved that:

- the graph could stay intact
- branch-level execution was possible
- the major remaining failures were no longer “unknown compatibility”

### Phase 4: full-size failure diagnosis and capacity realism

The next turning point was the full-size failure on the main Dasiwa branch.  
The important result was not “the run failed”, but **why** it failed:

1. the failure happened on the first full-size Wan denoise peak
2. both runtime evidence and theoretical memory math supported the same diagnosis
3. repeated generic tweaks (`lowvram`, `cpu-vae`, attention experiments) did not change the root cause

This led to one of the strongest process lessons in the whole repo:

> once both runtime and theory say the active path exceeds the hardware budget, stop calling it a generic tuning problem.

That became the basis for the canonical migration checklist’s capacity hard-stop rule.

### Phase 5: customer-facing delivery and GUI validation

The work then moved beyond engineering smoke and into deliverable validation:

1. workflow validation copies were created
2. Intel-safe overrides were frozen into validation-friendly workflow copies
3. a dedicated GUI validation instance was used
4. whole-workflow GUI smoke evidence was captured
5. the delivery package became end-user oriented rather than engineer oriented

This was another important maturation point:

- early migration evidence was engineering-facing
- later evidence became customer-reviewable

### Phase 6: generalization into reusable documentation

Finally, the repo was reorganized so that the work did not remain trapped inside Dasiwa-specific notes.

This produced:

1. reusable migration prompt/skill docs
2. reusable review and release standards
3. node-package migration standards
4. package-specific Mixlab and Wan case docs
5. artifact layout rules
6. a clearer split between generic method docs and case docs

## 3. Main technical problems encountered

### 3.1 Asset provenance was more complex than “download the model”

Several runs depended on assets in different states:

1. public and fully staged
2. shared-root resolved
3. compatibility alias only
4. unresolved proprietary source

The work improved once this stopped being hidden.

### 3.2 Custom-node migration was not one problem

The workflow used several families of custom nodes with very different risk types:

1. true compute-path nodes
2. memory/cleanup helpers
3. prompt/VQA helpers
4. UI/control nodes
5. postprocess/interpolation nodes

Some needed code patches.  
Some only needed runtime-safe parameter overrides.  
Some were better kept CPU-biased.  
Some were not worth treating as native-XPU targets at all.

This led to the more mature classification model used later in Mixlab:

- native XPU
- CPU fallback
- integration gap
- feature-development gap

### 3.3 Prompt export was an underappreciated source of false conclusions

One of the most important practical failures was prompt conversion:

1. widget-only inputs could be silently dropped
2. selector-backed names could invalidate a branch
3. logs could claim success even when the intended output node never ran

This means the migration problem was never only about kernels or device strings.  
It was also about making the conversion and validation path trustworthy.

### 3.4 Full-size OOM was initially easy to misdiagnose

At different points, there were plausible but wrong explanations:

1. missing assets
2. broken LoRA selectors
3. cond batching
4. generic lowvram issue
5. wrong helper node behavior

The later documentation shows a healthier process:

1. identify the exact failing node
2. inspect the active model path
3. compare runtime free/required memory with the device budget
4. compare that with the theoretical activation story

Only then decide whether the problem is migration, tuning, or capacity.

## 4. What the process did better over time

The migration process improved in several visible ways:

### 4.1 It became evidence-gated

The repo moved from ad hoc notes to a clear ladder:

1. inventory
2. prompt validation
3. branch smoke
4. full-size probe
5. review audit
6. release package

### 4.2 It stopped hiding unresolved source gaps

Smoke-only compatibility aliases are now documented explicitly instead of being silently treated as equivalent to the original assets.

### 4.3 It stopped treating every failure as “patch more”

The newer docs make sharper distinctions:

1. fixable migration issue
2. CPU-fallback delivery tier
3. integration problem
4. feature-development problem
5. hardware-capacity problem

This is a major improvement over the earlier implicit assumption that everything should keep moving toward native XPU.

### 4.4 It broadened from one workflow to a real migration method

The original task asked for a better workflow migration process with prompts, skills, and deliverables.  
The current docs now mostly provide that.

## 5. What is still weak

### 5.1 The Dasiwa story is still spread across many files

Even after cleanup, the Dasiwa case remains distributed across:

1. workflow analysis
2. migration plan
3. support matrix
4. full-size OOM report
5. delivery bundle
6. phase annexes

That is rational for evidence retention, but still heavy for a reviewer.

### 5.2 There is still no single “management summary”

The repo has technical depth, but it still lacks one concise, review-ready memo that answers:

1. what was the original ask
2. what was completed
3. what remains blocked
4. which blocked items are real feature work
5. what the next decision from humans should be

### 5.3 Some reusable docs still carry case DNA

This has improved, but some reusable docs still reflect Dasiwa-heavy assumptions and examples.  
That is acceptable for now, but future cleanup should keep pushing the generic docs toward method-first wording and move more case detail into annexes.

## 6. Retrospective conclusion

The overall migration effort should be considered **successful as a method-building and evidence-building task**, with **partial success at workflow runtime level** and **explicitly documented limits at full-size single-card execution**.

The strongest outcome is not only that a workflow was migrated.  
It is that the repo now contains a clearer answer to these questions:

1. how to decide whether a workflow is migratable on Intel XPU
2. how to detect when CPU fallback is the honest answer
3. how to detect when the problem is not migration anymore
4. how to package the result for both engineering review and customer review

That is the main reusable value produced by the work.
