import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import CompetitorPriceHistoryCard from "./CompetitorPriceHistoryCard";

interface CompetitorPriceHistoryListProps {
  competitors: Array<{ id: string; property_name: string; platform?: string }>;
  house_id: string;
}

const CompetitorPriceHistoryList = ({ competitors }: CompetitorPriceHistoryListProps) => {
  return (
    <Accordion type="multiple" defaultValue={competitors.slice(0, 2).map(c => c.id)} className="w-full">
      {competitors.map(competitor => (
        <AccordionItem key={competitor.id} value={competitor.id}>
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center justify-between w-full pr-4">
              <div className="flex items-center gap-3">
                <span className="font-medium">{competitor.property_name}</span>
                {competitor.platform && (
                  <Badge variant="outline" className="text-xs">
                    {competitor.platform}
                  </Badge>
                )}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CompetitorPriceHistoryCard competitor_id={competitor.id} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

export default CompetitorPriceHistoryList;
