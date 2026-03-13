namespace FirstProof.Problem9

def triangular : Nat -> Nat
  | 0 => 0
  | Nat.succ n => triangular n + Nat.succ n

end FirstProof.Problem9
