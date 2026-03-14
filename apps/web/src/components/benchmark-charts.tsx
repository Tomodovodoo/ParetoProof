import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const chartColors = {
  pass: "#0e8b73",
  fail: "#a8475e",
  invalid_result: "#b97514",
  primary: "#4f46e5",
  secondary: "#0891b2",
  tertiary: "#6d28d9",
  grid: "rgba(16, 42, 103, 0.08)",
  text: "#546a8a"
};

const providerColors: Record<string, string> = {
  anthropic: "#d97706",
  google: "#059669",
  openai: "#4f46e5",
  meta: "#7c3aed",
  mistral: "#0891b2"
};

function getProviderColor(provider: string) {
  return providerColors[provider] ?? chartColors.primary;
}

type VerdictDistributionProps = {
  data: {
    fail: number;
    invalid_result: number;
    pass: number;
  };
  height?: number;
};

export function VerdictDistributionChart({
  data,
  height = 200
}: VerdictDistributionProps) {
  const chartData = [
    { name: "Pass", value: data.pass, color: chartColors.pass },
    { name: "Fail", value: data.fail, color: chartColors.fail },
    {
      name: "Invalid",
      value: data.invalid_result,
      color: chartColors.invalid_result
    }
  ].filter((entry) => entry.value > 0);

  if (chartData.length === 0) {
    return (
      <div className="chart-empty">
        <p>No verdict data available yet.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
          strokeWidth={0}
        >
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "rgba(255,255,255,0.95)",
            border: "1px solid rgba(16,42,103,0.13)",
            borderRadius: "8px",
            fontSize: "0.85rem"
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "0.82rem", color: chartColors.text }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

type ProviderComparisonProps = {
  data: {
    passRate: number | null;
    providerFamily: string;
    totalRuns: number;
  }[];
  height?: number;
};

export function ProviderComparisonChart({
  data,
  height = 240
}: ProviderComparisonProps) {
  const chartData = data
    .filter((entry) => entry.totalRuns > 0)
    .map((entry) => ({
      ...entry,
      passRatePercent: entry.passRate != null ? Math.round(entry.passRate * 100) : 0,
      label: entry.providerFamily.charAt(0).toUpperCase() + entry.providerFamily.slice(1)
    }));

  if (chartData.length === 0) {
    return (
      <div className="chart-empty">
        <p>No provider data available yet.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} barSize={32}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: chartColors.text }}
          axisLine={{ stroke: chartColors.grid }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: chartColors.text }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
          tickFormatter={(value: number) => `${value}%`}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(255,255,255,0.95)",
            border: "1px solid rgba(16,42,103,0.13)",
            borderRadius: "8px",
            fontSize: "0.85rem"
          }}
          formatter={(value: number) => [`${value}%`, "Pass rate"]}
        />
        <Bar dataKey="passRatePercent" name="Pass rate" radius={[4, 4, 0, 0]}>
          {chartData.map((entry) => (
            <Cell
              key={entry.providerFamily}
              fill={getProviderColor(entry.providerFamily)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

type ActivityTimelineProps = {
  data: {
    date: string;
    passes: number;
    runs: number;
  }[];
  height?: number;
};

export function ActivityTimelineChart({
  data,
  height = 200
}: ActivityTimelineProps) {
  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <p>No recent activity to display.</p>
      </div>
    );
  }

  const chartData = data.map((entry) => ({
    ...entry,
    shortDate: entry.date.slice(5)
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
        <XAxis
          dataKey="shortDate"
          tick={{ fontSize: 11, fill: chartColors.text }}
          axisLine={{ stroke: chartColors.grid }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: chartColors.text }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(255,255,255,0.95)",
            border: "1px solid rgba(16,42,103,0.13)",
            borderRadius: "8px",
            fontSize: "0.85rem"
          }}
        />
        <Line
          type="monotone"
          dataKey="runs"
          name="Total runs"
          stroke={chartColors.primary}
          strokeWidth={2}
          dot={{ r: 3, fill: chartColors.primary }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="passes"
          name="Passes"
          stroke={chartColors.pass}
          strokeWidth={2}
          dot={{ r: 3, fill: chartColors.pass }}
          activeDot={{ r: 5 }}
        />
        <Legend
          iconType="line"
          iconSize={12}
          wrapperStyle={{ fontSize: "0.82rem", color: chartColors.text }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
