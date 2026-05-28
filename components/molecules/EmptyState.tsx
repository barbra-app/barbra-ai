import { Card, CardBody } from "@/components/atoms/Card";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Card>
      <CardBody className="text-center">
        <p className="text-base font-medium text-slate-900">{title}</p>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
        {action ? <div className="mt-4 inline-flex">{action}</div> : null}
      </CardBody>
    </Card>
  );
}
