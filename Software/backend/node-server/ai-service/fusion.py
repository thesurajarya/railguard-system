def fuse_results(vibration_result, vision_result):
    vib_score = vibration_result.get("score", 0)
    vis_score = vision_result.get("vision_confidence", 0)
    vis_anomaly = vision_result.get("vision_anomaly", False)

    # Base weighted score
    final_score = 0.6 * vib_score + 0.4 * vis_score

    # logic upgrades:
    # 1. If VLM is certain there's a person/tool, bump the score
    if vis_anomaly and vis_score > 0.8:
        severity = "CRITICAL"
        final_score = max(final_score, 0.9)
    # 2. Both confirm a threat
    elif vib_score > 0.7 and vis_score > 0.5:
        severity = "CRITICAL"
    # 3. High vibration but VLM is unsure (could be a heavy train or sabotage)
    elif vib_score > 0.8:
        severity = "HIGH"
    elif final_score > 0.5:
        severity = "MEDIUM"
    else:
        severity = "LOW"

    return {
        "final_alert": final_score > 0.4, # Lower threshold to ensure we don't miss early sabotage
        "final_score": round(final_score, 3),
        "severity": severity,
        "mode": "MULTIMODAL" if vis_score > 0 else "SENSOR_ONLY"
    }