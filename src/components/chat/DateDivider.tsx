import { format } from "date-fns";

interface Props {
  date: Date;
}

export default function DateDivider({ date }: Props) {
  return (
    <div className="date-divider">
      <span className="date-divider-text">
        {format(date, "MMMM d, yyyy")}
      </span>
    </div>
  );
}
