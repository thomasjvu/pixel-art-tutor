import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace" }}>
          <h2>Something broke while rendering.</h2>
          <p>{this.state.error.message}</p>
          <button
            onClick={() => {
              localStorage.removeItem("pixel-art-tutor.project.v1");
              location.reload();
            }}
          >
            Reset project and reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
