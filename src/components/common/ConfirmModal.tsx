import Modal from "./Modal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  danger?: boolean;
  isLoading?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  danger = false,
  isLoading = false,
}: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="confirm-description">{description}</p>
      <div className="confirm-actions">
        <button className="confirm-cancel" onClick={onClose}>
          Cancel
        </button>
        <button
          className={`confirm-button ${danger ? "danger" : ""}`}
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading ? "..." : confirmText}
        </button>
      </div>
    </Modal>
  );
}
