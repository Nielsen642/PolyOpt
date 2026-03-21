import { useState } from "react";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AddPositionValues = {
  marketId: string;
  yesShares: string;
  noShares: string;
  price: string;
};

type AddPositionDialogProps = {
  onSubmit: (values: AddPositionValues) => void;
  isPending: boolean;
};

const initialValues: AddPositionValues = {
  marketId: "",
  yesShares: "0",
  noShares: "0",
  price: "0.50",
};

export function AddPositionDialog({ onSubmit, isPending }: AddPositionDialogProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState(initialValues);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setFormData(initialValues);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
          <Target className="mr-2 h-4 w-4" />
          Add Position
        </Button>
      </DialogTrigger>

      <DialogContent className="glass-panel border-border/50">
        <DialogHeader>
          <DialogTitle>Add Position</DialogTitle>
        </DialogHeader>

        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(formData);
            setOpen(false);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="marketId">Market ID</Label>
            <Input
              id="marketId"
              value={formData.marketId}
              onChange={(event) => setFormData({ ...formData, marketId: event.target.value })}
              placeholder="e.g. 0x123"
              className="bg-black/50 font-mono-data"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="yesShares" className="text-emerald-400">Yes Shares</Label>
              <Input
                id="yesShares"
                type="number"
                min="0"
                step="0.01"
                value={formData.yesShares}
                onChange={(event) => setFormData({ ...formData, yesShares: event.target.value })}
                className="bg-black/50"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="noShares" className="text-red-400">No Shares</Label>
              <Input
                id="noShares"
                type="number"
                min="0"
                step="0.01"
                value={formData.noShares}
                onChange={(event) => setFormData({ ...formData, noShares: event.target.value })}
                className="bg-black/50"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Entry Yes Price</Label>
            <Input
              id="price"
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={formData.price}
              onChange={(event) => setFormData({ ...formData, price: event.target.value })}
              className="bg-black/50"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Adding..." : "Save Position"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
