/**
 * AICTE Decision Support Prototype - Versioned YAML Rules Explorer & Diff Matrix
 * Step 53 & Step 54: Version Switcher & Regulatory Norms Comparison (ui/js/components/rules_view.js)
 * 
 * Inspect active & candidate YAML rule logic, toggle version policies (v4.0 vs v4.1),
 * highlight changed clauses, threshold shifts, and effective academic year dates
 * conforming to Approval Process Handbook norms without opening Python source files.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RulesViewComponent = factory();
    root.rulesViewComponent = new root.RulesViewComponent();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // Version 4.0 Manifest (APH 2024-25 & 2025-26 Established Norms)
  const MANIFEST_V4_0 = {
    rule_set: "EOA_RENEWAL",
    version: 4,
    demo: true,
    effective_from: "2024-04-01",
    effective_to: "2026-03-31",
    academic_year: "2024-25 to 2025-26",
    approved_by: "Domain Reviewer (Illustrative Synthetic Demo)",
    params: {
      expiry_warn_days: 30,
      name_min_ratio: 90
    },
    total_rules: 15,
    categories: [
      "ARITHMETIC_CONSISTENCY",
      "AUTHENTICITY",
      "CAPACITY_INTAKE",
      "CHRONOLOGY",
      "DOCUMENTATION",
      "EXPIRY_VALIDITY",
      "FACULTY",
      "ID_FORMAT",
      "INSTITUTION_RECORD",
      "INTEGRITY_CROSS_CHECK",
      "LAND_INFRA"
    ],
    rules: [
      {
        id: "R-DOC-001",
        type: "required_doc",
        status: "synthetic_demo",
        category: "DOCUMENTATION",
        evaluator_name: "eval_required_doc",
        mandatory: true,
        doc_type: "AFFIDAVIT",
        severity: "high",
        rectifiable: true,
        inputs: [],
        message: "Required affidavit/undertaking document not submitted",
        expression_logic: "doc_type == 'AFFIDAVIT' in submitted_documents",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter II, Clause 2.1 (Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 3,
        tests: [
          { name: "missing", docs: ["FIRE_NOC"], expect: "FAILED_CHECK" },
          { name: "present", docs: ["AFFIDAVIT"], expect: "PASS" },
          { name: "unclassified_present", docs: ["FIRE_NOC", "UNCLASSIFIED"], expect: "NEEDS_REVIEW" }
        ],
        raw_yaml: `  - id: R-DOC-001
    type: required_doc
    status: synthetic_demo
    mandatory: true
    doc_type: AFFIDAVIT
    severity: high
    rectifiable: true
    inputs: []
    message: "Required affidavit/undertaking document not submitted"
    ref:
      handbook: "APH 2024-25 to 2026-27"
      clause: "Chapter II, Clause 2.1 (Illustrative synthetic demo)"`
      },
      {
        id: "R-EXP-001",
        type: "not_expired",
        status: "synthetic_demo",
        category: "EXPIRY_VALIDITY",
        evaluator_name: "eval_not_expired",
        mandatory: true,
        doc_type: "FIRE_NOC",
        field: "valid_till",
        params: { as_of: "submission_date", warn_days: 30 },
        severity: "high",
        rectifiable: true,
        message: "Fire NOC validity date precedes application submission or expires within warning window",
        expression_logic: "FIRE_NOC.valid_till >= submission_date (warn if <= submission_date + 30d)",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter II, Clause 2.3 (Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 6,
        tests: [
          { name: "expired", facts: { "FIRE_NOC.valid_till": "2026-03-31" }, expect: "FAILED_CHECK" },
          { name: "boundary_last_valid_day", facts: { "FIRE_NOC.valid_till": "2026-10-12" }, expect: "WARNING" },
          { name: "soon", facts: { "FIRE_NOC.valid_till": "2026-10-30" }, expect: "WARNING" },
          { name: "ok", facts: { "FIRE_NOC.valid_till": "2027-06-01" }, expect: "PASS" },
          { name: "missing", facts: {}, expect: "NOT_CHECKED" },
          { name: "ambiguous_2digit_year", raw: { "FIRE_NOC.valid_till": "31/03/26" }, expect: "NEEDS_REVIEW" }
        ],
        raw_yaml: `  - id: R-EXP-001
    type: not_expired
    status: synthetic_demo
    mandatory: true
    doc_type: FIRE_NOC
    field: valid_till
    params:
      as_of: submission_date
      warn_days: 30
    inputs: [FIRE_NOC.valid_till]
    severity: high
    rectifiable: true
    message: "Fire NOC validity date precedes application submission or expires within warning window"`
      },
      {
        id: "R-CROSS-001",
        type: "fuzzy_match",
        status: "synthetic_demo",
        category: "INTEGRITY_CROSS_CHECK",
        evaluator_name: "eval_fuzzy_match",
        mandatory: false,
        params: { min_ratio: 90 },
        severity: "medium",
        rectifiable: false,
        message: "Institution name in document differs from official institute registry record",
        expression_logic: "levenshtein_ratio(ACCREDITATION.institution_name, record.institute.name) >= 90%",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter II, Clause 2.4 (Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 4,
        tests: [
          { name: "matching_names", expect: "PASS" },
          { name: "legal_form_differs", expect: "NEEDS_REVIEW" },
          { name: "partial_match", expect: "NEEDS_REVIEW" },
          { name: "different_institution", expect: "FAILED_CHECK" }
        ],
        raw_yaml: `  - id: R-CROSS-001
    type: fuzzy_match
    status: synthetic_demo
    left:
      doc_type: ACCREDITATION
      field: institution_name
    right:
      record: institute.name
    params:
      min_ratio: 90
    severity: medium
    inputs: [ACCREDITATION.institution_name]`
      },
      {
        id: "R-NUM-001",
        type: "field_lte_record",
        status: "synthetic_demo",
        category: "CAPACITY_INTAKE",
        evaluator_name: "eval_field_lte_record",
        mandatory: true,
        severity: "high",
        rectifiable: false,
        message: "Requested intake exceeds approved record intake",
        expression_logic: "form.requested_intake <= record.approved_programmes.intake",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter II, Clause 2.5 (Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 3,
        tests: [
          { name: "intake_ok", expect: "PASS" },
          { name: "intake_exceeded", expect: "FAILED_CHECK" },
          { name: "intake_missing_record", expect: "NOT_CHECKED" }
        ],
        raw_yaml: `  - id: R-NUM-001
    type: field_lte_record
    status: synthetic_demo
    left:
      form: requested_intake
    right:
      record: approved_programmes.intake
    severity: high`
      },
      {
        id: "R-INTAKE-001",
        type: "field_lte_record",
        status: "synthetic_demo",
        category: "CAPACITY_INTAKE",
        evaluator_name: "eval_field_lte_record",
        mandatory: true,
        severity: "high",
        rectifiable: false,
        message: "Requested intake exceeds approved record intake",
        expression_logic: "form.requested_intake <= record.approved_programmes.intake",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter II, Clause 2.5 (Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 3,
        tests: [
          { name: "intake_ok", expect: "PASS" },
          { name: "intake_exceeded", expect: "FAILED_CHECK" },
          { name: "intake_missing_record", expect: "NOT_CHECKED" }
        ]
      },
      {
        id: "R-TBL-001",
        type: "table_sums_consistent",
        status: "synthetic_demo",
        category: "ARITHMETIC_CONSISTENCY",
        evaluator_name: "eval_table_sums_consistent",
        mandatory: false,
        severity: "medium",
        rectifiable: true,
        message: "Table arithmetic consistency check for programmes/intake tables",
        expression_logic: "sum(EOA_LETTER.division_intakes) == EOA_LETTER.total_intake",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter II, Clause 2.6 (Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 2,
        tests: [
          { name: "table_arithmetic_ok", expect: "PASS" },
          { name: "table_arithmetic_mismatch", expect: "FAILED_CHECK" }
        ]
      },
      {
        id: "R-ID-001",
        type: "id_format",
        status: "synthetic_demo",
        category: "ID_FORMAT",
        evaluator_name: "eval_id_format",
        mandatory: false,
        severity: "medium",
        rectifiable: true,
        message: "Certificate number format conforms to issuer registry specifications",
        expression_logic: "regex_match(FIRE_NOC.certificate_no, '^(?:FIRE/[A-Z]{2}/\\d{4}/\\d+|NOC-\\d{4}-\\d+|[A-Z0-9/-]{6,25})$')",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter II, Clause 2.7 (Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 2,
        tests: [
          { name: "valid_id", expect: "PASS" },
          { name: "invalid_id", expect: "FAILED_CHECK" }
        ]
      },
      {
        id: "R-COMP-001",
        type: "required_field",
        status: "synthetic_demo",
        category: "DOCUMENTATION",
        evaluator_name: "eval_required_field",
        mandatory: true,
        severity: "high",
        rectifiable: true,
        message: "Mandatory fields extracted and parsed without ambiguity",
        expression_logic: "all(extracted(f) for f in [FIRE_NOC.certificate_no, FIRE_NOC.valid_till])",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter II, Clause 2.8 (Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 2,
        tests: [
          { name: "complete", expect: "PASS" },
          { name: "incomplete", expect: "FAILED_CHECK" }
        ]
      },
      {
        id: "R-LAND-001",
        type: "land_area_norm",
        status: "planned",
        category: "LAND_INFRA",
        evaluator_name: "eval_land_area_norm (candidate)",
        mandatory: true,
        severity: "high",
        rectifiable: false,
        params: { min_acres_metro: 1.5, min_acres_urban: 2.5, min_acres_rural: 5.0 },
        message: "Institution land area satisfies minimum acreage norms per category",
        expression_logic: "campus.land_acres >= norms.min_acres[metro: 1.5, urban: 2.5, rural: 5.0]",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter IV, Clause 4.1 (Land Norms - Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 2,
        tests: [
          { name: "metro_land_ok", expect: "PASS" },
          { name: "rural_land_insufficient", expect: "FAILED_CHECK" }
        ]
      },
      {
        id: "R-FAC-001",
        type: "faculty_ratio",
        status: "planned",
        category: "FACULTY",
        evaluator_name: "eval_faculty_ratio (candidate)",
        mandatory: true,
        severity: "high",
        rectifiable: true,
        params: { students_per_faculty: 20 },
        message: "Faculty-to-student ratio satisfies regulatory standard (1:20)",
        expression_logic: "faculty_count / total_enrolled_students >= 1 / 20",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter V, Clause 5.2 (Faculty Norms)",
          amendment: null
        },
        tests_count: 2,
        tests: [
          { name: "ratio_compliant", expect: "PASS" },
          { name: "ratio_deficit", expect: "FAILED_CHECK" }
        ]
      },
      {
        id: "R-MARK-001",
        type: "visual_mark_present",
        status: "planned",
        category: "AUTHENTICITY",
        evaluator_name: "eval_visual_mark (candidate)",
        mandatory: false,
        severity: "low",
        rectifiable: true,
        message: "Visual verification mark / physical signature detected",
        expression_logic: "visual_mark_detected(AFFIDAVIT, 'signature') == true",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter II, Clause 2.9 (Candidate rule)"
        },
        tests_count: 1,
        tests: [{ name: "signature_detected", expect: "PASS" }]
      },
      {
        id: "R-ID-002",
        type: "id_match",
        status: "planned",
        category: "INTEGRITY_CROSS_CHECK",
        evaluator_name: "eval_id_match (candidate)",
        mandatory: true,
        severity: "high",
        rectifiable: false,
        message: "Plot number match between Fire NOC and Building Plan",
        expression_logic: "FIRE_NOC.plot_no == BUILDING_PLAN.plot_no",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter II, Clause 2.10 (Candidate rule)"
        },
        tests_count: 1,
        tests: [{ name: "plot_no_match", expect: "PASS" }]
      },
      {
        id: "R-DATE-001",
        type: "date_order",
        status: "planned",
        category: "CHRONOLOGY",
        evaluator_name: "eval_date_order (candidate)",
        mandatory: false,
        severity: "medium",
        rectifiable: true,
        message: "Chronological sequence check: Building completion precedes or matches Fire NOC issuance",
        expression_logic: "BUILDING_COMPLETION.issued_on <= FIRE_NOC.issued_on",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter II, Clause 2.11 (Candidate rule)"
        },
        tests_count: 1,
        tests: [{ name: "order_valid", expect: "PASS" }]
      },
      {
        id: "R-REC-001",
        type: "record_flag",
        status: "planned",
        category: "INSTITUTION_RECORD",
        evaluator_name: "eval_record_flag (candidate)",
        mandatory: true,
        severity: "high",
        rectifiable: false,
        message: "TER processing fee payment status verified as paid",
        expression_logic: "records.ter_payment == 'paid'",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter I, Clause 1.4 (Payment records)"
        },
        tests_count: 1,
        tests: [{ name: "fee_paid", expect: "PASS" }]
      },
      {
        id: "R-REC-002",
        type: "record_flag",
        status: "planned",
        category: "INSTITUTION_RECORD",
        evaluator_name: "eval_record_flag (candidate)",
        mandatory: true,
        severity: "high",
        rectifiable: false,
        message: "No open unresolved institutional deficiencies on record",
        expression_logic: "records.deficiencies.open_count == 0",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2024-25 to 2026-27",
          clause: "Chapter I, Clause 1.6 (Prior deficiencies)"
        },
        tests_count: 1,
        tests: [{ name: "no_deficiencies", expect: "PASS" }]
      }
    ]
  };

  // Version 4.1 Manifest (APH 2026-27 Amended Norms)
  const MANIFEST_V4_1 = {
    rule_set: "EOA_RENEWAL_v4_1",
    version: "4.1",
    demo: true,
    effective_from: "2026-04-01",
    effective_to: null,
    academic_year: "2026-27",
    approved_by: "Domain Reviewer (Illustrative Synthetic Demo - APH 2026-27 Update)",
    params: {
      expiry_warn_days: 45,
      name_min_ratio: 95
    },
    total_rules: 15,
    categories: [
      "ARITHMETIC_CONSISTENCY",
      "AUTHENTICITY",
      "CAPACITY_INTAKE",
      "CHRONOLOGY",
      "DOCUMENTATION",
      "EXPIRY_VALIDITY",
      "FACULTY",
      "ID_FORMAT",
      "INSTITUTION_RECORD",
      "INTEGRITY_CROSS_CHECK",
      "LAND_INFRA"
    ],
    rules: [
      {
        id: "R-DOC-001",
        type: "required_doc",
        status: "synthetic_demo",
        category: "DOCUMENTATION",
        evaluator_name: "eval_required_doc",
        mandatory: true,
        doc_type: "AFFIDAVIT",
        severity: "high",
        rectifiable: true,
        inputs: [],
        message: "Required affidavit/undertaking document not submitted (Amended Digital Policy)",
        expression_logic: "doc_type == 'AFFIDAVIT' in submitted_documents",
        is_synthetic_demo: true,
        is_amended: true,
        ref: {
          handbook: "APH 2026-27",
          clause: "Chapter II, Clause 2.1-A (Amended Digital Submissions)",
          amendment: "2026-Gazette-Ext-4"
        },
        tests_count: 3
      },
      {
        id: "R-EXP-001",
        type: "not_expired",
        status: "synthetic_demo",
        category: "EXPIRY_VALIDITY",
        evaluator_name: "eval_not_expired",
        mandatory: true,
        doc_type: "FIRE_NOC",
        field: "valid_till",
        params: { as_of: "submission_date", warn_days: 45 },
        severity: "high",
        rectifiable: true,
        message: "Fire NOC validity date precedes application submission or expires within 45-day warning window",
        expression_logic: "FIRE_NOC.valid_till >= submission_date (warn if <= submission_date + 45d)",
        is_synthetic_demo: true,
        is_amended: true,
        ref: {
          handbook: "APH 2026-27",
          clause: "Chapter II, Clause 2.3-B (Enhanced 45-Day Safety Window)",
          amendment: "2026-Gazette-Ext-4"
        },
        tests_count: 6
      },
      {
        id: "R-CROSS-001",
        type: "fuzzy_match",
        status: "synthetic_demo",
        category: "INTEGRITY_CROSS_CHECK",
        evaluator_name: "eval_fuzzy_match",
        mandatory: false,
        params: { min_ratio: 95 },
        severity: "medium",
        rectifiable: false,
        message: "Institution name in document differs from official institute registry record (Tightened 95% Threshold)",
        expression_logic: "levenshtein_ratio(ACCREDITATION.institution_name, record.institute.name) >= 95%",
        is_synthetic_demo: true,
        is_amended: true,
        ref: {
          handbook: "APH 2026-27",
          clause: "Chapter II, Clause 2.4-A (High-Precision Identity Match)",
          amendment: "2026-Gazette-Ext-4"
        },
        tests_count: 4
      },
      {
        id: "R-NUM-001",
        type: "field_lte_record",
        status: "synthetic_demo",
        category: "CAPACITY_INTAKE",
        evaluator_name: "eval_field_lte_record",
        mandatory: true,
        severity: "high",
        rectifiable: false,
        message: "Requested intake exceeds approved record intake",
        expression_logic: "form.requested_intake <= record.approved_programmes.intake",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2026-27",
          clause: "Chapter II, Clause 2.5 (Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 3
      },
      {
        id: "R-INTAKE-001",
        type: "field_lte_record",
        status: "synthetic_demo",
        category: "CAPACITY_INTAKE",
        evaluator_name: "eval_field_lte_record",
        mandatory: true,
        severity: "high",
        rectifiable: false,
        message: "Requested intake exceeds approved record intake",
        expression_logic: "form.requested_intake <= record.approved_programmes.intake",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2026-27",
          clause: "Chapter II, Clause 2.5 (Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 3
      },
      {
        id: "R-TBL-001",
        type: "table_sums_consistent",
        status: "synthetic_demo",
        category: "ARITHMETIC_CONSISTENCY",
        evaluator_name: "eval_table_sums_consistent",
        mandatory: false,
        severity: "medium",
        rectifiable: true,
        message: "Table arithmetic consistency check for programmes/intake tables",
        expression_logic: "sum(EOA_LETTER.division_intakes) == EOA_LETTER.total_intake",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2026-27",
          clause: "Chapter II, Clause 2.6 (Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 2
      },
      {
        id: "R-ID-001",
        type: "id_format",
        status: "synthetic_demo",
        category: "ID_FORMAT",
        evaluator_name: "eval_id_format",
        mandatory: false,
        severity: "medium",
        rectifiable: true,
        message: "Certificate number format conforms to issuer registry specifications",
        expression_logic: "regex_match(FIRE_NOC.certificate_no, '^(?:FIRE/[A-Z]{2}/\\d{4}/\\d+|NOC-\\d{4}-\\d+|[A-Z0-9/-]{6,25})$')",
        is_synthetic_demo: true,
        ref: {
          handbook: "APH 2026-27",
          clause: "Chapter II, Clause 2.7 (Illustrative synthetic demo)",
          amendment: null
        },
        tests_count: 2
      },
      {
        id: "R-COMP-001",
        type: "required_field",
        status: "synthetic_demo",
        category: "DOCUMENTATION",
        evaluator_name: "eval_required_field",
        mandatory: true,
        severity: "high",
        rectifiable: true,
        message: "Mandatory fields extracted and parsed without ambiguity (Amended 2026 Schema)",
        expression_logic: "all(extracted(f) for f in [FIRE_NOC.certificate_no, FIRE_NOC.valid_till])",
        is_synthetic_demo: true,
        is_amended: true,
        ref: {
          handbook: "APH 2026-27",
          clause: "Chapter II, Clause 2.8-A (Enhanced Extraction Completeness)",
          amendment: "2026-Gazette-Ext-4"
        },
        tests_count: 2
      },
      {
        id: "R-LAND-001",
        type: "land_area_norm",
        status: "planned",
        category: "LAND_INFRA",
        evaluator_name: "eval_land_area_norm (candidate)",
        mandatory: true,
        severity: "high",
        rectifiable: false,
        params: { min_acres_metro: 1.0, min_acres_urban: 2.0, min_acres_rural: 4.0 },
        message: "Institution land area satisfies minimum acreage norms per category (Amended Vertical Campus Policy)",
        expression_logic: "campus.land_acres >= norms.min_acres[metro: 1.0, urban: 2.0, rural: 4.0]",
        is_synthetic_demo: true,
        is_amended: true,
        ref: {
          handbook: "APH 2026-27",
          clause: "Chapter IV, Clause 4.1-Amended (Vertical & Smart Campus Norms)",
          amendment: "2026-Gazette-Ext-4"
        },
        tests_count: 2
      },
      {
        id: "R-FAC-001",
        type: "faculty_ratio",
        status: "planned",
        category: "FACULTY",
        evaluator_name: "eval_faculty_ratio (candidate)",
        mandatory: true,
        severity: "high",
        rectifiable: true,
        params: { students_per_faculty: 15 },
        message: "Faculty-to-student ratio satisfies tightened regulatory standard (1:15)",
        expression_logic: "faculty_count / total_enrolled_students >= 1 / 15",
        is_synthetic_demo: true,
        is_amended: true,
        ref: {
          handbook: "APH 2026-27",
          clause: "Chapter V, Clause 5.2-A (Tightened 1:15 Faculty Standard)",
          amendment: "2026-Gazette-Ext-4"
        },
        tests_count: 2
      },
      {
        id: "R-MARK-001",
        type: "visual_mark_present",
        status: "planned",
        category: "AUTHENTICITY",
        evaluator_name: "eval_visual_mark (candidate)",
        mandatory: false,
        severity: "low",
        rectifiable: true,
        message: "Visual verification mark / physical signature detected",
        expression_logic: "visual_mark_detected(AFFIDAVIT, 'signature') == true",
        is_synthetic_demo: true,
        ref: { handbook: "APH 2026-27", clause: "Chapter II, Clause 2.9 (Candidate rule)" },
        tests_count: 1
      },
      {
        id: "R-ID-002",
        type: "id_match",
        status: "planned",
        category: "INTEGRITY_CROSS_CHECK",
        evaluator_name: "eval_id_match (candidate)",
        mandatory: true,
        severity: "high",
        rectifiable: false,
        message: "Plot number match between Fire NOC and Building Plan",
        expression_logic: "FIRE_NOC.plot_no == BUILDING_PLAN.plot_no",
        is_synthetic_demo: true,
        ref: { handbook: "APH 2026-27", clause: "Chapter II, Clause 2.10 (Candidate rule)" },
        tests_count: 1
      },
      {
        id: "R-DATE-001",
        type: "date_order",
        status: "planned",
        category: "CHRONOLOGY",
        evaluator_name: "eval_date_order (candidate)",
        mandatory: false,
        severity: "medium",
        rectifiable: true,
        message: "Chronological sequence check: Building completion precedes or matches Fire NOC issuance",
        expression_logic: "BUILDING_COMPLETION.issued_on <= FIRE_NOC.issued_on",
        is_synthetic_demo: true,
        ref: { handbook: "APH 2026-27", clause: "Chapter II, Clause 2.11 (Candidate rule)" },
        tests_count: 1
      },
      {
        id: "R-REC-001",
        type: "record_flag",
        status: "planned",
        category: "INSTITUTION_RECORD",
        evaluator_name: "eval_record_flag (candidate)",
        mandatory: true,
        severity: "high",
        rectifiable: false,
        message: "TER processing fee payment status verified as paid",
        expression_logic: "records.ter_payment == 'paid'",
        is_synthetic_demo: true,
        ref: { handbook: "APH 2026-27", clause: "Chapter I, Clause 1.4 (Payment records)" },
        tests_count: 1
      },
      {
        id: "R-REC-002",
        type: "record_flag",
        status: "planned",
        category: "INSTITUTION_RECORD",
        evaluator_name: "eval_record_flag (candidate)",
        mandatory: true,
        severity: "high",
        rectifiable: false,
        message: "No open unresolved institutional deficiencies on record",
        expression_logic: "records.deficiencies.open_count == 0",
        is_synthetic_demo: true,
        ref: { handbook: "APH 2026-27", clause: "Chapter I, Clause 1.6 (Prior deficiencies)" },
        tests_count: 1
      }
    ]
  };

  class RulesViewComponent {
    constructor(options = {}) {
      this.containerId = options.containerId || 'view-rules';
      this.availableRuleSets = ['EOA_RENEWAL', 'EOA_RENEWAL_v4_1'];
      this.currentRuleSetName = 'EOA_RENEWAL'; // default v4.0
      this.activeRuleSet = MANIFEST_V4_0;
      this.v4_0_Data = MANIFEST_V4_0;
      this.v4_1_Data = MANIFEST_V4_1;
      this.selectedCategory = 'ALL';
      this.searchQuery = '';
      this.statusFilter = 'ALL'; // ALL | ACTIVE | PLANNED
      this.selectedRuleId = null;
      this.isDiffMode = false;
      this.isLoading = false;
    }

    /**
     * Load rules from backend API (or fallback to manifest) and render view
     */
    async loadAndRender(ruleSetName = null) {
      if (ruleSetName) this.currentRuleSetName = ruleSetName;
      const container = document.getElementById(this.containerId);
      if (!container) return;

      this.isLoading = true;
      try {
        if (typeof window !== 'undefined' && window.api && typeof window.api.getRuleSet === 'function') {
          // Fetch current active rule set
          const res = await window.api.getRuleSet(this.currentRuleSetName);
          if (res && res.rules && res.rules.length > 0) {
            this.activeRuleSet = res;
            if (this.currentRuleSetName === 'EOA_RENEWAL') this.v4_0_Data = res;
            else if (this.currentRuleSetName === 'EOA_RENEWAL_v4_1') this.v4_1_Data = res;
          }

          // Preload the alternate version for instant zero-latency diffing
          const altName = this.currentRuleSetName === 'EOA_RENEWAL' ? 'EOA_RENEWAL_v4_1' : 'EOA_RENEWAL';
          try {
            const altRes = await window.api.getRuleSet(altName);
            if (altRes && altRes.rules) {
              if (altName === 'EOA_RENEWAL') this.v4_0_Data = altRes;
              else this.v4_1_Data = altRes;
            }
          } catch (_) {}
        }
      } catch (err) {
        console.warn('API getRuleSet unavailable, using deterministic manifest fallback:', err);
        this.activeRuleSet = (this.currentRuleSetName === 'EOA_RENEWAL_v4_1') ? MANIFEST_V4_1 : MANIFEST_V4_0;
      } finally {
        this.isLoading = false;
        this.render();
      }
    }

    /**
     * Switch active version policy (v4.0 vs v4.1)
     */
    async switchVersion(versionName) {
      this.currentRuleSetName = versionName;
      if (versionName === 'EOA_RENEWAL_v4_1') {
        this.activeRuleSet = this.v4_1_Data || MANIFEST_V4_1;
      } else {
        this.activeRuleSet = this.v4_0_Data || MANIFEST_V4_0;
      }

      await this.loadAndRender(versionName);
    }

    /**
     * Toggle difference matrix view
     */
    toggleDiffMode(forceState = null) {
      this.isDiffMode = (forceState !== null) ? forceState : !this.isDiffMode;
      this.render();
    }

    /**
     * Core render method assembling all subcomponents
     */
    render() {
      const container = document.getElementById(this.containerId);
      if (!container) return;

      const rs = this.activeRuleSet;
      const isV41 = (String(rs.version) === '4.1' || this.currentRuleSetName === 'EOA_RENEWAL_v4_1');
      const filteredRules = this.getFilteredRules();

      container.innerHTML = `
        <div class="rules-explorer-container" id="rules-explorer-host">
          <!-- 1. Header Card with Metadata, Version Switcher & Synthetic Demo Banner -->
          <div class="rules-header-card" id="rules-header">
            <div class="rules-header-top">
              <div class="rules-header-title">
                <h2>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  Rules & Checklists Explorer
                </h2>
                <p class="text-muted text-xs" style="margin: 0;">
                  Deterministic regulatory logic, expressions, evaluators, and test assertions per Approval Process Handbook
                </p>
              </div>

              <!-- Version Switcher & Comparison Controls -->
              <div class="rules-version-controls">
                <label for="select-rules-version" class="text-xs text-muted" style="font-weight:600;">Active Norms:</label>
                <select id="select-rules-version" class="rules-version-select">
                  <option value="EOA_RENEWAL" ${!isV41 ? 'selected' : ''}>
                    v4.0 (APH 2024-26 Established Norms)
                  </option>
                  <option value="EOA_RENEWAL_v4_1" ${isV41 ? 'selected' : ''}>
                    v4.1 (APH 2026-27 Amended Standards)
                  </option>
                </select>

                <button id="btn-toggle-rules-diff" class="btn-compare-versions ${this.isDiffMode ? 'active' : ''}" title="View side-by-side differences between v4.0 and v4.1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 3h5v5"/>
                    <path d="M4 20L21 3"/>
                    <path d="M21 16v5h-5"/>
                    <path d="M15 15l6 6"/>
                    <path d="M4 4l5 5"/>
                  </svg>
                  ${this.isDiffMode ? 'Hide Differences' : 'Compare Versions (v4.0 vs v4.1)'}
                </button>
              </div>
            </div>

            <!-- Version Metadata Tags -->
            <div class="rules-meta-tags" style="margin-top: 0.875rem;">
              <span class="badge-rules-version" id="badge-rules-version">
                ${escapeHtml(rs.rule_set || 'EOA_RENEWAL')} v${escapeHtml(String(rs.version || '4.0'))}
              </span>
              <span class="badge-rules-active" id="badge-rules-status">
                ${isV41 ? 'AMENDED REGULATORY POLICY' : 'ACTIVE REGULATORY SET'}
              </span>
              <span class="badge badge-simulated" id="badge-rules-effective">
                ${isV41 ? 'Effective: 2026-04-01 onwards (AY 2026-27)' : 'Effective: 2024-04-01 to 2026-03-31 (AY 2024-26)'}
              </span>
              ${isV41 ? '<span class="badge-version-amended" id="badge-amendment-notice">Gazette Ext-4 / 45-day window</span>' : ''}
            </div>

            <!-- Non-negotiable Synthetic Demo Notice per AGENTS.md -->
            <div class="rules-disclaimer-banner" id="banner-rules-synthetic-disclaimer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" style="flex-shrink:0;">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <strong>Regulatory Integrity Notice (Prototype Guide §12 & AGENTS.md):</strong>
                All displayed rules are marked as <code>synthetic_demo</code> and serve illustrative prototype decision-support purposes.
                Official AICTE Approval Process Handbook (APH) clauses and numeric thresholds require regulatory domain review before presentation as enforceable standards.
              </div>
            </div>
          </div>

          <!-- 2. Difference Matrix Panel (Visible when isDiffMode = true) -->
          ${this.isDiffMode ? this.renderDiffPanel() : ''}

          <!-- 3. Metrics Ribbon -->
          <div class="rules-metrics-grid" id="rules-metrics-bar">
            <div class="rules-metric-card" id="card-metric-total">
              <span class="rules-metric-label">Total Rules Defined</span>
              <span class="rules-metric-value" id="metric-total-rules">${rs.rules ? rs.rules.length : 0}</span>
              <span class="rules-metric-subtext">Version ${escapeHtml(String(rs.version || '4.0'))} Manifest</span>
            </div>
            <div class="rules-metric-card" id="card-metric-active">
              <span class="rules-metric-label">Active Norms</span>
              <span class="rules-metric-value" style="color: #059669;" id="metric-active-rules">
                ${rs.rules ? rs.rules.filter(r => r.status !== 'planned').length : 0}
              </span>
              <span class="rules-metric-subtext">Deterministic evaluation</span>
            </div>
            <div class="rules-metric-card" id="card-metric-planned">
              <span class="rules-metric-label">Planned Candidates</span>
              <span class="rules-metric-value" style="color: #6366f1;" id="metric-planned-rules">
                ${rs.rules ? rs.rules.filter(r => r.status === 'planned').length : 0}
              </span>
              <span class="rules-metric-subtext">Candidate extensions</span>
            </div>
            <div class="rules-metric-card" id="card-metric-synthetic">
              <span class="rules-metric-label">Synthetic Badges</span>
              <span class="rules-metric-value" style="color: #d97706;" id="metric-synthetic-rules">
                ${rs.rules ? rs.rules.filter(r => r.is_synthetic_demo !== false).length : 0}
              </span>
              <span class="rules-metric-subtext">100% labeled demo</span>
            </div>
            <div class="rules-metric-card" id="card-metric-evaluators">
              <span class="rules-metric-label">Python Evaluators</span>
              <span class="rules-metric-value" style="color: #0284c7;" id="metric-evaluators-count">
                ${rs.rules ? new Set(rs.rules.map(r => r.evaluator_name)).size : 0}
              </span>
              <span class="rules-metric-subtext">Registered functions</span>
            </div>
          </div>

          <!-- 4. Toolbar: Search, Status Toggle & Category Pills -->
          <div class="rules-toolbar" id="rules-controls-bar">
            <div class="rules-toolbar-top">
              <div class="rules-search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input 
                  type="text" 
                  id="rules-search-input" 
                  class="rules-search-input" 
                  placeholder="Search rules by ID (e.g. R-DOC-001, R-LAND-001), keyword, evaluator, or clause..."
                  value="${escapeHtml(this.searchQuery)}"
                />
              </div>

              <div class="rules-status-toggle" id="rules-status-toggle">
                <button class="rules-status-btn ${this.statusFilter === 'ALL' ? 'active' : ''}" data-status="ALL">
                  All (${rs.rules ? rs.rules.length : 0})
                </button>
                <button class="rules-status-btn ${this.statusFilter === 'ACTIVE' ? 'active' : ''}" data-status="ACTIVE">
                  Active (${rs.rules ? rs.rules.filter(r => r.status !== 'planned').length : 0})
                </button>
                <button class="rules-status-btn ${this.statusFilter === 'PLANNED' ? 'active' : ''}" data-status="PLANNED">
                  Planned (${rs.rules ? rs.rules.filter(r => r.status === 'planned').length : 0})
                </button>
              </div>
            </div>

            <!-- Category Filter Pills -->
            <div class="rules-categories-row" id="rules-category-filters">
              ${this.renderCategoryPills()}
            </div>
          </div>

          <!-- 5. Rules Data Table -->
          <div class="rules-table-wrapper" id="rules-table-container">
            ${this.renderTableContent(filteredRules, isV41)}
          </div>

          <!-- 6. Rule Logic Inspector Modal Placeholder -->
          <div id="rule-inspector-modal-host"></div>
        </div>
      `;

      this.bindEvents(container);
    }

    /**
     * Render side-by-side difference panel comparing v4.0 vs v4.1
     */
    renderDiffPanel() {
      const v4_0 = this.v4_0_Data || MANIFEST_V4_0;
      const v4_1 = this.v4_1_Data || MANIFEST_V4_1;

      // Calculate diffs between v4.0 and v4.1
      const rules40Map = new Map((v4_0.rules || []).map(r => [r.id, r]));
      const rules41Map = new Map((v4_1.rules || []).map(r => [r.id, r]));

      const allIds = Array.from(new Set([...rules40Map.keys(), ...rules41Map.keys()])).sort();

      const diffItems = allIds.map(id => {
        const b = rules40Map.get(id);
        const t = rules41Map.get(id);

        let status = 'UNCHANGED';
        let impact = 'Norm retained without alteration';
        let clauseChanged = false;
        let thresholdChanged = false;

        if (b && !t) {
          status = 'REMOVED';
          impact = 'Norm deprecated in v4.1';
        } else if (!b && t) {
          status = 'ADDED';
          impact = 'New regulatory check introduced in v4.1';
        } else {
          const bExpr = b.expression_logic || '';
          const tExpr = t.expression_logic || '';
          const bClause = (b.ref && b.ref.clause) || '';
          const tClause = (t.ref && t.ref.clause) || '';
          const bParams = JSON.stringify(b.params || {});
          const tParams = JSON.stringify(t.params || {});

          clauseChanged = (bClause !== tClause);
          thresholdChanged = (bExpr !== tExpr || bParams !== tParams);

          if (clauseChanged || thresholdChanged || b.message !== t.message) {
            status = 'MODIFIED';
            if (id === 'R-EXP-001') impact = 'Safety buffer window expanded from 30 days to 45 days';
            else if (id === 'R-CROSS-001') impact = 'Name matching precision tightened from 90% to 95%';
            else if (id === 'R-LAND-001') impact = 'Campus acreage requirements adjusted for vertical/smart campuses';
            else if (id === 'R-FAC-001') impact = 'Faculty-to-student ratio standard tightened from 1:20 to 1:15';
            else if (id === 'R-DOC-001') impact = 'Digital affidavit submission policy amendment (Gazette Ext-4)';
            else if (id === 'R-COMP-001') impact = 'Enhanced extraction completeness schema enforced';
            else impact = 'Regulatory clause citation updated to APH 2026-27';
          }
        }

        return { id, base: b, target: t, status, impact, clauseChanged, thresholdChanged };
      });

      const modifiedCount = diffItems.filter(d => d.status === 'MODIFIED').length;
      const unchangedCount = diffItems.filter(d => d.status === 'UNCHANGED').length;

      return `
        <div class="rules-diff-container" id="rules-diff-container">
          <!-- Diff Header Banner -->
          <div class="diff-header-banner" id="diff-header-banner">
            <div class="diff-header-title">
              <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
                  <path d="M16 3h5v5"/>
                  <path d="M4 20L21 3"/>
                  <path d="M21 16v5h-5"/>
                  <path d="M15 15l6 6"/>
                  <path d="M4 4l5 5"/>
                </svg>
                Regulatory Difference Matrix: v4.0 (AY 2024-26) ➔ v4.1 (AY 2026-27)
              </h3>
              <p class="text-muted text-xs" style="margin: 0;">
                Side-by-side comparison of Approval Process Handbook normative updates, threshold adjustments, and statutory date ranges
              </p>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="pill-modified diff-status-pill">${modifiedCount} MODIFIED</span>
              <span class="pill-unchanged diff-status-pill">${unchangedCount} UNCHANGED</span>
              <button id="btn-close-diff-panel" class="btn btn-secondary btn-sm" style="margin-left:0.5rem;">Close Matrix</button>
            </div>
          </div>

          <!-- Academic Year & Effective Date Range Shift Highlights -->
          <div class="diff-date-shift-card" id="diff-academic-shift">
            <div class="diff-date-item">
              <span class="diff-date-label">Base Version (v4.0) Effective Period:</span>
              <span class="diff-date-val" id="diff-base-dates">
                ${escapeHtml(v4_0.effective_from || '2024-04-01')} to ${escapeHtml(v4_0.effective_to || '2026-03-31')}
                <small style="color:#475569;">(Academic Years 2024-25 & 2025-26)</small>
              </span>
            </div>
            <div style="font-size:1.2rem; color:#16a34a; font-weight:700;">➔</div>
            <div class="diff-date-item">
              <span class="diff-date-label">Amended Version (v4.1) Effective Period:</span>
              <span class="diff-date-val" id="diff-target-dates">
                ${escapeHtml(v4_1.effective_from || '2026-04-01')} onwards
                <small style="color:#166534; font-weight:700;">(Academic Year 2026-27 Amendment)</small>
              </span>
            </div>
            <span class="diff-highlight-dates" id="badge-calendar-shift">
              CALENDAR SHIFT (+1 Academic Cycle)
            </span>
          </div>

          <!-- Global Threshold Shifts Grid -->
          <div class="diff-params-grid" id="diff-params-grid">
            <div class="diff-param-card">
              <div class="diff-param-header">
                <span class="diff-param-name">expiry_warn_days</span>
                <span class="pill-modified diff-status-pill">PARAM SHIFT</span>
              </div>
              <div class="text-xs text-muted">Advance warning window before application submission for Fire NOC & clearances</div>
              <div class="diff-param-shift">
                <span class="diff-param-base">${v4_0.params ? v4_0.params.expiry_warn_days : 30} days</span>
                <span>➔</span>
                <span class="diff-param-target">${v4_1.params ? v4_1.params.expiry_warn_days : 45} days (+15d safety buffer)</span>
              </div>
            </div>

            <div class="diff-param-card">
              <div class="diff-param-header">
                <span class="diff-param-name">name_min_ratio</span>
                <span class="pill-modified diff-status-pill">PARAM SHIFT</span>
              </div>
              <div class="text-xs text-muted">Minimum Levenshtein token similarity for institutional name cross-verification</div>
              <div class="diff-param-shift">
                <span class="diff-param-base">${v4_0.params ? v4_0.params.name_min_ratio : 90}%</span>
                <span>➔</span>
                <span class="diff-param-target">${v4_1.params ? v4_1.params.name_min_ratio : 95}% (+5% strictness)</span>
              </div>
            </div>

            <div class="diff-param-card">
              <div class="diff-param-header">
                <span class="diff-param-name">faculty_student_ratio</span>
                <span class="pill-modified diff-status-pill">NORM SHIFT</span>
              </div>
              <div class="text-xs text-muted">Prescribed regular faculty to student intake ratio (R-FAC-001)</div>
              <div class="diff-param-shift">
                <span class="diff-param-base">1:20 Ratio</span>
                <span>➔</span>
                <span class="diff-param-target">1:15 Ratio (Accreditation Alignment)</span>
              </div>
            </div>
          </div>

          <!-- Side-by-Side Rules Diff Table -->
          <div class="diff-table-wrapper">
            <table class="diff-table" id="diff-rules-table">
              <thead>
                <tr>
                  <th style="width: 130px;">Rule ID</th>
                  <th style="width: 100px;">Status</th>
                  <th style="width: 32%;">Base Version (v4.0 Established)</th>
                  <th style="width: 32%;">Amended Version (v4.1 Norms)</th>
                  <th>Regulatory Impact</th>
                </tr>
              </thead>
              <tbody>
                ${diffItems.map(item => this.renderDiffRow(item)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    /**
     * Render single row in the difference matrix table
     */
    renderDiffRow(item) {
      const b = item.base;
      const t = item.target;
      const isModified = item.status === 'MODIFIED';

      const bClause = b && b.ref ? `${b.ref.handbook || 'APH'}, ${b.ref.clause || ''}` : 'N/A';
      const tClause = t && t.ref ? `${t.ref.handbook || 'APH'}, ${t.ref.clause || ''}` : 'N/A';

      const pillClass = item.status === 'MODIFIED' ? 'pill-modified' :
                        item.status === 'ADDED' ? 'pill-added' :
                        item.status === 'REMOVED' ? 'pill-removed' : 'pill-unchanged';

      return `
        <tr class="${isModified ? 'diff-row-modified' : ''}" id="diff-row-${escapeHtml(item.id)}">
          <td>
            <span class="rule-id-pill">${escapeHtml(item.id)}</span>
          </td>
          <td>
            <span class="diff-status-pill ${pillClass}">${escapeHtml(item.status)}</span>
          </td>
          <td>
            ${b ? `
              <div style="font-size:0.775rem; color:#475569; margin-bottom:0.25rem;">${escapeHtml(b.message || '')}</div>
              <div style="font-family:var(--font-mono, monospace); font-size:0.75rem; background:#f1f5f9; padding:0.25rem 0.5rem; border-radius:0.25rem;">
                ${escapeHtml(b.expression_logic || '')}
              </div>
              <div class="rule-ref-clause" style="font-size:0.725rem; color:#64748b; margin-top:0.25rem;">
                ${escapeHtml(bClause)}
              </div>
            ` : '<em class="text-muted">Not present in v4.0</em>'}
          </td>
          <td>
            ${t ? `
              <div style="font-size:0.775rem; font-weight:600; color:#1e293b; margin-bottom:0.25rem;">${escapeHtml(t.message || '')}</div>
              <div class="${item.thresholdChanged ? 'diff-changed-threshold' : ''}" style="font-family:var(--font-mono, monospace); font-size:0.75rem; background:#f8fafc; padding:0.25rem 0.5rem; border-radius:0.25rem;">
                ${escapeHtml(t.expression_logic || '')}
              </div>
              <div class="rule-ref-clause ${item.clauseChanged ? 'diff-changed-clause' : ''}" style="font-size:0.725rem; margin-top:0.25rem;">
                ${escapeHtml(tClause)}
                ${t.ref && t.ref.amendment ? `<span style="font-weight:700; color:#1d4ed8;">[${escapeHtml(t.ref.amendment)}]</span>` : ''}
              </div>
            ` : '<em class="text-muted">Removed in v4.1</em>'}
          </td>
          <td>
            <div style="font-size: 0.8rem; color: ${isModified ? '#92400e' : '#475569'}; font-weight: ${isModified ? '600' : 'normal'};">
              ${escapeHtml(item.impact)}
            </div>
          </td>
        </tr>
      `;
    }

    /**
     * Render category pills with active indicators and counts
     */
    renderCategoryPills() {
      const rs = this.activeRuleSet;
      const allRules = rs.rules || [];

      // Extract unique categories
      const categories = ['ALL', ...Array.from(new Set(allRules.map(r => r.category || 'GENERAL'))).sort()];

      return categories.map(cat => {
        const count = cat === 'ALL' ? allRules.length : allRules.filter(r => (r.category || 'GENERAL') === cat).length;
        const isActive = this.selectedCategory === cat;
        return `
          <button class="btn-rule-cat ${isActive ? 'active' : ''}" data-category="${escapeHtml(cat)}">
            ${escapeHtml(this.formatCategoryLabel(cat))}
            <span class="cat-count">${count}</span>
          </button>
        `;
      }).join('');
    }

    /**
     * Format category slug to friendly display name
     */
    formatCategoryLabel(cat) {
      if (cat === 'ALL') return 'All Categories';
      return cat.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Get CSS class for category pill
     */
    getCategoryClass(cat) {
      const map = {
        DOCUMENTATION: 'cat-doc',
        EXPIRY_VALIDITY: 'cat-validity',
        CAPACITY_INTAKE: 'cat-intake',
        INTEGRITY_CROSS_CHECK: 'cat-cross',
        LAND_INFRA: 'cat-infra',
        FACULTY: 'cat-faculty',
        ARITHMETIC_CONSISTENCY: 'cat-arithmetic'
      };
      return map[cat] || 'cat-general';
    }

    /**
     * Render the 8-column rules table
     */
    renderTableContent(rules, isV41 = false) {
      if (!rules || rules.length === 0) {
        return `
          <div style="padding: 3rem; text-align: center; color: var(--text-muted, #64748b);">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:0.75rem; opacity:0.6;">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <div style="font-weight:600; font-size:1rem; margin-bottom:0.25rem;">No matching regulatory rules found</div>
            <div style="font-size:0.8rem;">Try clearing your search query or selecting "All Categories".</div>
          </div>
        `;
      }

      return `
        <table class="rules-table" id="rules-data-table">
          <thead>
            <tr>
              <th id="th-rule-id" style="width: 140px;">Rule ID</th>
              <th id="th-rule-category" style="width: 150px;">Category</th>
              <th id="th-rule-desc">Rule Requirement & Handbook Clause</th>
              <th id="th-rule-expression" style="width: 280px;">Expression Logic</th>
              <th id="th-rule-evaluator" style="width: 180px;">Evaluator Name</th>
              <th id="th-rule-severity" style="width: 110px;">Severity</th>
              <th id="th-rule-tests" style="width: 80px; text-align: center;">Tests</th>
              <th id="th-rule-actions" style="width: 100px; text-align: right;">Inspect</th>
            </tr>
          </thead>
          <tbody>
            ${rules.map(rule => this.renderTableRow(rule, isV41)).join('')}
          </tbody>
        </table>
      `;
    }

    /**
     * Render single table row for a rule
     */
    renderTableRow(rule, isV41 = false) {
      const isPlanned = rule.status === 'planned';
      const catClass = this.getCategoryClass(rule.category);
      const handbookRef = rule.ref ? `${rule.ref.handbook || 'APH'}, ${rule.ref.clause || ''}` : 'Illustrative Synthetic Demo';
      const isAmended = isV41 && (rule.is_amended || (rule.ref && rule.ref.amendment));

      let severityBadge = '';
      if (rule.severity === 'high') {
        severityBadge = '<span class="badge badge-failed" style="font-size:0.7rem;">HIGH</span>';
      } else if (rule.severity === 'medium') {
        severityBadge = '<span class="badge badge-warning" style="font-size:0.7rem;">MEDIUM</span>';
      } else {
        severityBadge = '<span class="badge badge-simulated" style="font-size:0.7rem;">LOW</span>';
      }

      const rectifiableText = rule.rectifiable ? '<span style="font-size:0.675rem; color:#059669; display:block;">Rectifiable (7d)</span>' : '';

      return `
        <tr class="${isPlanned ? 'rule-row-planned' : ''} ${isAmended ? 'diff-row-modified' : ''}" id="rule-row-${escapeHtml(rule.id)}">
          <td>
            <div style="display:flex; flex-direction:column; gap:0.35rem; align-items:flex-start;">
              <span class="rule-id-pill" id="pill-${escapeHtml(rule.id)}">${escapeHtml(rule.id)}</span>
              ${rule.is_synthetic_demo !== false ? `
                <span class="badge-synthetic-demo" title="Illustrative synthetic norm per AGENTS.md">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                  synthetic_demo
                </span>
              ` : ''}
              ${isAmended ? '<span class="badge-version-amended" id="badge-amended-' + escapeHtml(rule.id) + '">v4.1 AMENDED</span>' : ''}
              ${isPlanned ? '<span style="font-size:0.675rem; color:#6366f1; font-weight:600;">[PLANNED]</span>' : ''}
            </div>
          </td>
          <td>
            <span class="rule-category-pill ${catClass}" id="cat-pill-${escapeHtml(rule.id)}">
              ${escapeHtml(rule.category || 'GENERAL')}
            </span>
            ${rule.mandatory ? '<span style="display:block; font-size:0.7rem; color:#b91c1c; font-weight:600; margin-top:0.25rem;">Mandatory</span>' : ''}
          </td>
          <td>
            <div style="font-weight: 600; color: #1e293b; margin-bottom: 0.25rem;">
              ${escapeHtml(rule.message || rule.type)}
            </div>
            <div class="rule-ref-clause ${isAmended ? 'diff-changed-clause' : ''}" id="clause-ref-${escapeHtml(rule.id)}" title="Regulatory Reference">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>${escapeHtml(handbookRef)}</span>
              ${rule.ref && rule.ref.amendment ? `<span style="font-weight:700; color:#1d4ed8;">[${escapeHtml(rule.ref.amendment)}]</span>` : ''}
            </div>
          </td>
          <td>
            <div class="rule-expression-box ${isAmended ? 'diff-changed-threshold' : ''}" id="expr-${escapeHtml(rule.id)}">
              <code>${escapeHtml(rule.expression_logic || rule.type)}</code>
            </div>
          </td>
          <td>
            <span class="rule-evaluator-tag ${isPlanned ? 'candidate' : ''}" id="eval-${escapeHtml(rule.id)}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              ${escapeHtml(rule.evaluator_name || ('eval_' + rule.type))}
            </span>
          </td>
          <td>
            <div style="display:flex; flex-direction:column; gap:0.2rem;">
              ${severityBadge}
              ${rectifiableText}
            </div>
          </td>
          <td style="text-align: center;">
            <span class="badge badge-simulated" style="font-family:var(--font-mono, monospace); font-size:0.75rem;" title="${rule.tests_count || 0} verification test cases defined">
              ${rule.tests_count || (rule.tests ? rule.tests.length : 0)}
            </span>
          </td>
          <td style="text-align: right;">
            <button class="btn-inspect-rule" data-rule-id="${escapeHtml(rule.id)}" title="Inspect YAML & logic without Python files">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Inspect
            </button>
          </td>
        </tr>
      `;
    }

    /**
     * Filter active rules list based on category, search query, and status
     */
    getFilteredRules() {
      const rs = this.activeRuleSet;
      if (!rs || !rs.rules) return [];

      let list = rs.rules;

      // Status filter
      if (this.statusFilter === 'ACTIVE') {
        list = list.filter(r => r.status !== 'planned');
      } else if (this.statusFilter === 'PLANNED') {
        list = list.filter(r => r.status === 'planned');
      }

      // Category filter
      if (this.selectedCategory !== 'ALL') {
        list = list.filter(r => (r.category || 'GENERAL') === this.selectedCategory);
      }

      // Keyword search
      if (this.searchQuery && this.searchQuery.trim().length > 0) {
        const q = this.searchQuery.trim().toLowerCase();
        list = list.filter(r => {
          const id = (r.id || '').toLowerCase();
          const msg = (r.message || '').toLowerCase();
          const expr = (r.expression_logic || '').toLowerCase();
          const ev = (r.evaluator_name || '').toLowerCase();
          const cat = (r.category || '').toLowerCase();
          const clause = (r.ref && r.ref.clause ? r.ref.clause : '').toLowerCase();
          return id.includes(q) || msg.includes(q) || expr.includes(q) || ev.includes(q) || cat.includes(q) || clause.includes(q);
        });
      }

      return list;
    }

    /**
     * Set category filter and re-render table
     */
    setCategoryFilter(category) {
      this.selectedCategory = category;
      this.render();
    }

    /**
     * Set search query and re-render table
     */
    setSearchQuery(query) {
      this.searchQuery = query;
      this.render();
    }

    /**
     * Set status filter (ALL, ACTIVE, PLANNED) and re-render table
     */
    setStatusFilter(status) {
      this.statusFilter = status;
      this.render();
    }

    /**
     * Open modal/drawer to inspect exact rule logic, evaluator, and YAML without opening Python files
     */
    openRuleInspector(ruleId) {
      const rs = this.activeRuleSet;
      if (!rs || !rs.rules) return;

      const rule = rs.rules.find(r => r.id === ruleId);
      if (!rule) return;

      this.selectedRuleId = ruleId;
      const host = document.getElementById('rule-inspector-modal-host');
      if (!host) return;

      const handbookRef = rule.ref ? `${rule.ref.handbook || 'APH'}, ${rule.ref.clause || ''}` : 'Illustrative Synthetic Demo';
      const tests = rule.tests || [];

      host.innerHTML = `
        <div class="rule-modal-backdrop" id="modal-backdrop-rule">
          <div class="rule-modal-container" id="modal-container-rule">
            <div class="rule-modal-header">
              <div class="rule-modal-title">
                <span class="rule-id-pill" style="font-size: 1rem;">${escapeHtml(rule.id)}</span>
                <span class="rule-category-pill ${this.getCategoryClass(rule.category)}">
                  ${escapeHtml(rule.category || 'GENERAL')}
                </span>
                ${rule.is_synthetic_demo !== false ? `
                  <span class="badge-synthetic-demo">synthetic_demo</span>
                ` : ''}
              </div>
              <button id="btn-close-rule-modal" class="btn btn-secondary btn-sm" style="padding:0.25rem 0.5rem;">✕</button>
            </div>

            <div class="rule-modal-body">
              <div>
                <h4 style="margin: 0 0 0.35rem 0; font-size: 1.1rem; color: #0f172a;">${escapeHtml(rule.message || rule.type)}</h4>
                <div style="font-size: 0.8rem; color: #64748b;">
                  Regulatory Clause: <strong>${escapeHtml(handbookRef)}</strong>
                  ${rule.ref && rule.ref.amendment ? `<span style="color:#1d4ed8; font-weight:700;">[Amendment: ${escapeHtml(rule.ref.amendment)}]</span>` : ''}
                </div>
              </div>

              <!-- Expression Logic & Evaluator Breakdown -->
              <div>
                <div style="font-size: 0.8rem; font-weight: 600; color: #475569; text-transform: uppercase; margin-bottom: 0.4rem;">
                  Mathematical & Logical Expression
                </div>
                <div class="rule-expression-box" style="font-size: 0.85rem; padding: 0.75rem 1rem;">
                  <code>${escapeHtml(rule.expression_logic || rule.type)}</code>
                </div>
                <div style="margin-top: 0.5rem; display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem;">
                  <span style="color: #64748b;">Python Evaluator Function:</span>
                  <span class="rule-evaluator-tag">
                    <code>${escapeHtml(rule.evaluator_name || ('eval_' + rule.type))}(rule, facts, context)</code>
                  </span>
                </div>
              </div>

              <!-- Test Scenarios -->
              <div>
                <div style="font-size: 0.8rem; font-weight: 600; color: #475569; text-transform: uppercase; margin-bottom: 0.4rem;">
                  Rule Verification Test Scenarios (${tests.length})
                </div>
                ${tests.length > 0 ? `
                  <table class="rule-tests-table">
                    <thead>
                      <tr>
                        <th>Scenario Name</th>
                        <th>Input Facts / Docs</th>
                        <th>Expected Gate Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${tests.map(t => {
                        let outcomeBadge = '<span class="badge badge-simulated">UNKNOWN</span>';
                        if (t.expect === 'PASS') outcomeBadge = '<span class="badge badge-pass">PASS</span>';
                        else if (t.expect === 'FAILED_CHECK') outcomeBadge = '<span class="badge badge-failed">FAILED_CHECK</span>';
                        else if (t.expect === 'NEEDS_REVIEW') outcomeBadge = '<span class="badge badge-warning">NEEDS_REVIEW</span>';
                        else if (t.expect === 'WARNING') outcomeBadge = '<span class="badge badge-warning">WARNING</span>';
                        else if (t.expect === 'NOT_CHECKED') outcomeBadge = '<span class="badge badge-simulated">NOT_CHECKED</span>';

                        const inputsDesc = t.docs ? `docs: [${t.docs.join(', ')}]` :
                                          t.facts ? JSON.stringify(t.facts) :
                                          t.missing ? `missing: [${t.missing.join(', ')}]` :
                                          t.value ? `value: "${t.value}"` :
                                          t.doc_name ? `doc: "${t.doc_name}", record: "${t.record_name}"` :
                                          'Standard inputs';

                        return `
                          <tr>
                            <td><strong>${escapeHtml(t.name || 'test')}</strong></td>
                            <td><code style="font-size:0.75rem;">${escapeHtml(inputsDesc)}</code></td>
                            <td>${outcomeBadge}</td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                ` : '<div style="font-size:0.8rem; color:#64748b;">No test cases defined.</div>'}
              </div>

              <!-- Raw YAML Block -->
              <div>
                <div style="font-size: 0.8rem; font-weight: 600; color: #475569; text-transform: uppercase; margin-bottom: 0.4rem;">
                  Raw YAML Definition (${escapeHtml(rs.rule_set || 'EOA_RENEWAL')}.yaml)
                </div>
                <div class="rule-yaml-container">
                  <pre class="rule-yaml-code"><code>${escapeHtml(rule.raw_yaml || JSON.stringify(rule, null, 2))}</code></pre>
                </div>
              </div>
            </div>

            <div class="rule-modal-footer">
              <button id="btn-modal-dismiss" class="btn btn-primary btn-sm">Close Inspector</button>
            </div>
          </div>
        </div>
      `;

      // Wire close handlers
      const closeModal = () => this.closeRuleInspector();
      const btnClose = document.getElementById('btn-close-rule-modal');
      const btnDismiss = document.getElementById('btn-modal-dismiss');
      const backdrop = document.getElementById('modal-backdrop-rule');

      if (btnClose) btnClose.addEventListener('click', closeModal);
      if (btnDismiss) btnDismiss.addEventListener('click', closeModal);
      if (backdrop) {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) closeModal();
        });
      }
    }

    /**
     * Close the open rule inspector modal
     */
    closeRuleInspector() {
      this.selectedRuleId = null;
      const host = document.getElementById('rule-inspector-modal-host');
      if (host) host.innerHTML = '';
    }

    /**
     * Bind DOM event listeners
     */
    bindEvents(container) {
      // Version dropdown switcher (Step 54)
      const versionSelect = container.querySelector('#select-rules-version');
      if (versionSelect) {
        versionSelect.addEventListener('change', (e) => {
          this.switchVersion(e.target.value);
        });
      }

      // Version diff toggle button (Step 54)
      const diffToggleBtn = container.querySelector('#btn-toggle-rules-diff');
      if (diffToggleBtn) {
        diffToggleBtn.addEventListener('click', () => {
          this.toggleDiffMode();
        });
      }

      // Close diff panel button
      const closeDiffBtn = container.querySelector('#btn-close-diff-panel');
      if (closeDiffBtn) {
        closeDiffBtn.addEventListener('click', () => {
          this.toggleDiffMode(false);
        });
      }

      // Search input
      const searchInput = container.querySelector('#rules-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this.searchQuery = e.target.value;
          this.render();
          // Maintain focus
          const updatedInput = container.querySelector('#rules-search-input');
          if (updatedInput) {
            updatedInput.focus();
            updatedInput.setSelectionRange(updatedInput.value.length, updatedInput.value.length);
          }
        });
      }

      // Status buttons
      const statusBtns = container.querySelectorAll('.rules-status-btn');
      statusBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const status = btn.getAttribute('data-status');
          this.setStatusFilter(status);
        });
      });

      // Category filter buttons
      const catBtns = container.querySelectorAll('.btn-rule-cat');
      catBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const cat = btn.getAttribute('data-category');
          this.setCategoryFilter(cat);
        });
      });

      // Inspect buttons
      const inspectBtns = container.querySelectorAll('.btn-inspect-rule');
      inspectBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const ruleId = btn.getAttribute('data-rule-id');
          this.openRuleInspector(ruleId);
        });
      });
    }
  }

  // Helper function to safely escape HTML
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return RulesViewComponent;
}));
