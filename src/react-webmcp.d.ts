import type * as React from "react";

declare module "react" {
  interface HTMLAttributes<T> extends React.AriaAttributes {
    /** WebMCP Declarative API: tool name exposed by this form */
    toolname?: string;
    /** WebMCP Declarative API: tool description exposed by this form */
    tooldescription?: string;
    /** WebMCP Declarative API: auto-submit when an agent fills the form */
    toolautosubmit?: boolean;
    /** WebMCP Declarative API: description for this form field parameter */
    toolparamdescription?: string;
  }
}
