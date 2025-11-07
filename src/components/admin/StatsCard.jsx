import React from 'react';
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function StatsCard({ title, value, icon: Icon, color }) {
  const colorClasses = {
    blue: "from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400",
    orange: "from-orange-500/20 to-orange-600/10 border-orange-500/30 text-orange-400",
    green: "from-green-500/20 to-green-600/10 border-green-500/30 text-green-400",
    red: "from-red-500/20 to-red-600/10 border-red-500/30 text-red-400"
  };

  return (
    <Card className={cn(
      "relative overflow-hidden bg-gradient-to-br border",
      colorClasses[color]
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">{title}</p>
            <p className="text-3xl font-bold text-white mt-1">{value}</p>
          </div>
          <div className={cn("p-3 rounded-xl bg-opacity-20", colorClasses[color].split(' ')[0])}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}