export const CONTEXTGUARD_UI_CAPABILITIES_VERSION =
  "1" as const;

export type ContextGuardUiCapabilityStatusV2 =
  | "LIVE_ADAPTER"
  | "CORE_API_AVAILABLE";

export interface ContextGuardUiFieldOptionV2 {
  value:
    string;

  label:
    string;
}

export interface ContextGuardUiFieldV2 {
  id:
    string;

  label:
    string;

  type:
    "text" |
    "textarea" |
    "select" |
    "number";

  required:
    boolean;

  placeholder?:
    string;

  default_value?:
    string | number;

  max_length?:
    number;

  options?:
    ContextGuardUiFieldOptionV2[];
}

export interface ContextGuardUiActionCapabilityV2 {
  id:
    string;

  label:
    string;

  description:
    string;

  execution_supported:
    boolean;

  fields:
    ContextGuardUiFieldV2[];
}

export interface ContextGuardUiProviderCapabilityV2 {
  id:
    string;

  name:
    string;

  category_id:
    string;

  description:
    string;

  status:
    ContextGuardUiCapabilityStatusV2;

  selectable:
    boolean;

  execution_adapter_available:
    boolean;

  actions:
    ContextGuardUiActionCapabilityV2[];
}

export interface ContextGuardUiCategoryCapabilityV2 {
  id:
    string;

  label:
    string;

  description:
    string;

  providers:
    ContextGuardUiProviderCapabilityV2[];
}

export interface ContextGuardUiCapabilitiesResponseV2 {
  capabilities_version:
    typeof CONTEXTGUARD_UI_CAPABILITIES_VERSION;

  ui_real_execution_enabled:
    boolean;

  categories:
    ContextGuardUiCategoryCapabilityV2[];
}

export interface ContextGuardUiCapabilitiesOptionsV2 {
  uiRealExecutionEnabled?:
    boolean;
}

function maintenanceIssueActions(): ContextGuardUiActionCapabilityV2[] {
  const basic: ContextGuardUiFieldV2[] = [
    { id: 'repository', label: 'Repository', type: 'text', required: true, placeholder: 'owner/repository' },
    { id: 'target_kind', label: 'Target type', type: 'select', required: true,
      default_value: 'branch', options: [{value:'branch',label:'Branch'}] },
    { id: 'target_ref', label: 'Branch', type: 'text', required: true, default_value: 'main' },
    { id: 'issue_number', label: 'Issue number', type: 'number', required: true }
  ];
  const action = (id:string, label:string, extras:ContextGuardUiFieldV2[] = []):ContextGuardUiActionCapabilityV2 => ({
    id, label,
    description: 'Real GitHub App issue maintenance: Worker/Guard verification, human approval, fresh preflight and single-use trusted execution.',
    execution_supported: true,
    fields: [...basic, ...extras]
  });
  return [
    action('comment_issue','Add a comment to an issue',[
      {id:'body',label:'Comment',type:'textarea',required:true,max_length:10000}]),
    action('add_labels','Add labels to an issue',[
      {id:'labels',label:'Labels (comma-separated)',type:'text',required:true,max_length:500}]),
    action('edit_issue','Edit an issue title and description',[
      {id:'title',label:'New title',type:'text',required:true,max_length:256},
      {id:'body',label:'New description',type:'textarea',required:true,max_length:10000}]),
    action('close_issue','Close an issue'),
    action('reopen_issue','Reopen an issue')
  ];
}

export function getContextGuardUiCapabilitiesV2(
  options:
    ContextGuardUiCapabilitiesOptionsV2 = {}
): ContextGuardUiCapabilitiesResponseV2 {
  return {
    capabilities_version:
      CONTEXTGUARD_UI_CAPABILITIES_VERSION,

    ui_real_execution_enabled:
      options.uiRealExecutionEnabled ===
      true,

    categories: [
      {
        id:
          "code_devops",

        label:
          "Code",

        description:
          "Protect actions performed on software repositories.",

        providers: [
          {
            id:
              "github",

            name:
              "GitHub",

            category_id:
              "code_devops",

            description:
              "Protect GitHub repository actions with independent state verification, authorization and trusted execution.",

            status:
              "LIVE_ADAPTER",

            selectable:
              true,

            execution_adapter_available:
              true,

            actions: [
              {
                id:
                  "create_issue",

                label:
                  "Create an issue (manual or AI-drafted)",

                description:
                  "An issue proposed by a Cominty Managed Agent or entered manually; verified and approved before execution.",

                execution_supported:
                  true,

                fields: [
                  {
                    id:
                      "repository",

                    label:
                      "Repository",

                    type:
                      "text",

                    required:
                      true,

                    placeholder:
                      "owner/repository"
                  },

                  {
                    id:
                      "target_kind",

                    label:
                      "Target type",

                    type:
                      "select",

                    required:
                      true,

                    default_value:
                      "branch",

                    options: [
                      {
                        value:
                          "branch",

                        label:
                          "Branch"
                      },

                      {
                        value:
                          "tag",

                        label:
                          "Tag"
                      },

                      {
                        value:
                          "commit",

                        label:
                          "Commit"
                      },

                      {
                        value:
                          "current_state",

                        label:
                          "Current state"
                      }
                    ]
                  },

                  {
                    id:
                      "target_ref",

                    label:
                      "Target reference",

                    type:
                      "text",

                    required:
                      false,

                    placeholder:
                      "main",

                    default_value:
                      "main"
                  },

                  {
                    id:
                      "title",

                    label:
                      "Issue title",

                    type:
                      "text",

                    required:
                      true,

                    max_length:
                      256
                  },

                  {
                    id:
                      "body",

                    label:
                      "Issue body",

                    type:
                      "textarea",

                    required:
                      true,

                    max_length:
                      10000
                  }
                ]
              },
              ...maintenanceIssueActions()
            ]
          }
        ]
      },

      {
        id:
          "custom",

        label:
          "Custom",

        description:
          "Integrate another system with the generic ContextGuard authorization core.",

        providers: [
          {
            id:
              "generic_api",

            name:
              "Custom API",

            category_id:
              "custom",

            description:
              "For developers who want to connect another provider to ContextGuard's generic V2 authorization contracts.",

            status:
              "CORE_API_AVAILABLE",

            selectable:
              false,

            execution_adapter_available:
              false,

            actions:
              []
          }
        ]
      }
    ]
  };
}
