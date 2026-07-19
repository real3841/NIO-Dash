import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  retryKey: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[dashboard] render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app loading">
          <h1>看板渲染失败</h1>
          <p className="nas-error">{this.state.error.message}</p>
          <button
            type="button"
            className="btn primary"
            onClick={() => this.setState((s) => ({ error: null, retryKey: s.retryKey + 1 }))}
          >
            重试
          </button>
        </div>
      );
    }
    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}
