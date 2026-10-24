-- Remove the retired conversion heuristic. Costs remain informational estimates.
alter table opportunities drop column if exists purchase_probability,
  drop column if exists expected_contribution;
